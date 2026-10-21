import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function saturdayDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 6
    ? null : date;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const targetWeekStart = saturdayDate(req.nextUrl.searchParams.get("weekStart"));
  if (!targetWeekStart) {
    return NextResponse.json({ error: "A Saturday weekStart is required." }, { status: 400 });
  }
  const [rows, target] = await Promise.all([
    prisma.financeMobileGroomingPostPayoutAdjustment.findMany({
      where: { targetWeekStart, amountCents: { not: 0 } },
      include: { sourcePayrollWeek: { select: { weekStart: true, weekEnd: true, mobileGroomingCloseout: { select: { closedAt: true } } } } },
      orderBy: [{ detectedAt: "desc" }, { employeeName: "asc" }],
    }),
    prisma.financePayrollWeek.findUnique({
      where: { business_weekStart: { business: "mobile-grooming", weekStart: targetWeekStart } },
      select: { mobileGroomingCloseout: { select: { closedAt: true } } },
    }),
  ]);
  return NextResponse.json({
    weekStart: targetWeekStart.toISOString().slice(0, 10),
    targetClosedAt: target?.mobileGroomingCloseout?.closedAt.toISOString() ?? null,
    totalCents: rows.reduce((sum, row) => sum + row.amountCents, 0),
    changes: rows.map((row) => ({
      id: row.id,
      employeeName: row.employeeName,
      sourceWeekStart: row.sourcePayrollWeek.weekStart.toISOString().slice(0, 10),
      sourceWeekEnd: row.sourcePayrollWeek.weekEnd.toISOString().slice(0, 10),
      sourceClosedAt: row.sourcePayrollWeek.mobileGroomingCloseout?.closedAt.toISOString() ?? null,
      baselinePayCents: row.baselinePayCents,
      revisedPayCents: row.revisedPayCents,
      amountCents: row.amountCents,
      detectedAt: row.detectedAt.toISOString(),
    })),
  });
}
