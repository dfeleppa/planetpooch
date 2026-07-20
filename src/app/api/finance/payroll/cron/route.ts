import { NextRequest, NextResponse } from "next/server";
import { lastCompletedPayrollWeekStart } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";
import { savePayroll } from "@/app/api/finance/payroll/route";

export const maxDuration = 120;

function authError(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

/**
 * Weekly handoff for the logged-in MoeGo browser extractor. GET is deliberately
 * read-only: it identifies the completed week and never fabricates payroll.
 * POST accepts the extractor's existing payrollUpload shape and uses the same
 * payroll persistence path as the admin UI.
 */
export async function GET(req: NextRequest) {
  const denied = authError(req);
  if (denied) return denied;
  const weekStart = lastCompletedPayrollWeekStart("pet-resort");
  const week = await prisma.financePayrollWeek.findUnique({
    where: { business_weekStart: { business: "pet-resort", weekStart } },
    select: { weekStart: true, weekEnd: true, automationStatus: true, reviewReasons: true, sourceRowCount: true },
  });
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  return NextResponse.json({
    ok: true,
    business: "pet-resort",
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    status: week?.automationStatus ?? "awaiting_source",
    reviewReasons: week?.reviewReasons ?? [],
    sourceRowCount: week?.sourceRowCount ?? null,
  });
}

export async function POST(req: NextRequest) {
  const denied = authError(req);
  if (denied) return denied;
  return savePayroll(req, { allowCron: true });
}
