import { NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const rows = await prisma.financeMobileGroomingPostPayoutAdjustment.findMany({
    where: { amountCents: { not: 0 } },
    include: { sourcePayrollWeek: { select: { weekStart: true, weekEnd: true } } },
    orderBy: [{ detectedAt: "desc" }, { employeeName: "asc" }],
  });
  const targets = await prisma.financePayrollWeek.findMany({
    where: { business: "mobile-grooming", weekStart: { in: rows.map((row) => row.targetWeekStart) } },
    select: { weekStart: true, mobileGroomingCloseout: { select: { closedAt: true } } },
  });
  const closedAtByWeek = new Map(targets.map((target) => [
    target.weekStart.toISOString().slice(0, 10), target.mobileGroomingCloseout?.closedAt.toISOString() ?? null,
  ]));
  const changes = rows.map((row) => ({
    id: row.id,
    employeeName: row.employeeName,
    sourceWeekStart: row.sourcePayrollWeek.weekStart.toISOString().slice(0, 10),
    sourceWeekEnd: row.sourcePayrollWeek.weekEnd.toISOString().slice(0, 10),
    targetWeekStart: row.targetWeekStart.toISOString().slice(0, 10),
    targetWeekEnd: new Date(row.targetWeekStart.getTime() + 6 * 86_400_000).toISOString().slice(0, 10),
    targetClosedAt: closedAtByWeek.get(row.targetWeekStart.toISOString().slice(0, 10)) ?? null,
    baselinePayCents: row.baselinePayCents,
    revisedPayCents: row.revisedPayCents,
    amountCents: row.amountCents,
    detectedAt: row.detectedAt.toISOString(),
  })).sort((a, b) =>
    Number(Boolean(a.targetClosedAt)) - Number(Boolean(b.targetClosedAt)) ||
    b.detectedAt.localeCompare(a.detectedAt)
  );
  return NextResponse.json({ changes });
}
