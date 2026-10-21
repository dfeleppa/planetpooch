import { NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { mobileGroomingCloseoutPreview, type MobilePayRule } from "@/lib/mobile-grooming-closeout";
import { postPayoutBreakdown } from "@/lib/mobile-grooming-post-payout";
import { normalizeEmployeeName } from "@/lib/payroll";

const employeeKey = (name: string) => normalizeEmployeeName(name).toLocaleLowerCase();

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
  const sourceWeeks = await prisma.financePayrollWeek.findMany({
    where: { id: { in: [...new Set(rows.map((row) => row.sourcePayrollWeekId))] } },
    select: {
      id: true, weekStart: true, mobileGroomingEntries: true,
      mobileGroomingCloseout: { select: { payoutSnapshot: true } },
      mobileGroomingPayLocks: { select: { employeeName: true, payoutSnapshot: true } },
    },
  });
  const latestRuleDate = sourceWeeks.reduce<Date | null>((latest, week) =>
    !latest || week.weekStart > latest ? week.weekStart : latest, null);
  const rules = latestRuleDate ? await prisma.financeMobileGroomingPayRule.findMany({
    where: { effectiveWeekStart: { lte: latestRuleDate } },
    orderBy: { effectiveWeekStart: "desc" },
    select: { employeeName: true, payKind: true, amountCents: true, effectiveWeekStart: true },
  }) : [];
  const detailsByWeek = new Map(sourceWeeks.map((week) => {
    const latestRules = new Map<string, MobilePayRule>();
    for (const rule of rules) {
      const key = employeeKey(rule.employeeName);
      if (rule.effectiveWeekStart <= week.weekStart && !latestRules.has(key) &&
          (rule.payKind === "fixed" || rule.payKind === "additive")) {
        latestRules.set(key, { employeeName: rule.employeeName, payKind: rule.payKind, amountCents: rule.amountCents });
      }
    }
    return [week.id, {
      baseline: new Map([
        ...(Array.isArray(week.mobileGroomingCloseout?.payoutSnapshot)
          ? week.mobileGroomingCloseout.payoutSnapshot.flatMap((item) =>
            item && typeof item === "object" && !Array.isArray(item) && typeof item.employeeName === "string"
              ? [[employeeKey(item.employeeName), item] as const] : [])
          : []),
        ...week.mobileGroomingPayLocks.map((lock) => [employeeKey(lock.employeeName), lock.payoutSnapshot] as const),
      ]),
      revised: new Map(mobileGroomingCloseoutPreview(
        week.mobileGroomingEntries, [], [], [], [], [...latestRules.values()]
      ).payouts.map((payout) => [employeeKey(payout.employeeName), payout] as const)),
    }] as const;
  }));
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
    breakdown: (() => {
      const details = detailsByWeek.get(row.sourcePayrollWeekId);
      const revised = details?.revised.get(employeeKey(row.employeeName));
      if (!revised || revised.groomerPayCents !== row.revisedPayCents) return null;
      return postPayoutBreakdown(details?.baseline.get(employeeKey(row.employeeName)), revised, row.amountCents, row.baselinePayCents);
    })(),
  })).sort((a, b) =>
    Number(Boolean(a.targetClosedAt)) - Number(Boolean(b.targetClosedAt)) ||
    b.detectedAt.localeCompare(a.detectedAt)
  );
  return NextResponse.json({ changes });
}
