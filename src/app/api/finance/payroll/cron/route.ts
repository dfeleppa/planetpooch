import { NextRequest, NextResponse } from "next/server";
import { lastCompletedPayrollWeekStart } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

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
 * Monday safety monitor. The browser-only MoeGo pull happens from the payroll
 * page; this route reports a failed cron when the completed week is missing or
 * still needs review.
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
  const status = week?.automationStatus ?? "missing";
  const needsAttention = !week || status === "needs_review";
  return NextResponse.json({
    ok: !needsAttention,
    business: "pet-resort",
    weekStart: weekStart.toISOString().slice(0, 10),
    weekEnd: weekEnd.toISOString().slice(0, 10),
    status,
    reviewReasons: week?.reviewReasons ?? [],
    sourceRowCount: week?.sourceRowCount ?? null,
    payrollUrl: "/finance/payroll",
  }, { status: needsAttention ? 409 : 200 });
}
