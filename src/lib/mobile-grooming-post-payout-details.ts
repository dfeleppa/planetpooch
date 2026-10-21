import { prisma } from "@/lib/prisma";
import { mobileGroomingCloseoutPreview, type MobilePayRule } from "@/lib/mobile-grooming-closeout";
import { postPayoutBreakdown } from "@/lib/mobile-grooming-post-payout";
import { normalizeEmployeeName } from "@/lib/payroll";

type Adjustment = {
  id: string;
  sourcePayrollWeekId: string;
  employeeName: string;
  baselinePayCents: number;
  revisedPayCents: number;
  amountCents: number;
};

const employeeKey = (name: string) => normalizeEmployeeName(name).toLocaleLowerCase();

/** Read the paid snapshot and current saved payroll for every source week once. */
export async function postPayoutBreakdowns(rows: Adjustment[]) {
  const breakdowns = new Map<string, ReturnType<typeof postPayoutBreakdown>>();
  if (rows.length === 0) return breakdowns;

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

  for (const row of rows) {
    const details = detailsByWeek.get(row.sourcePayrollWeekId);
    const revised = details?.revised.get(employeeKey(row.employeeName));
    breakdowns.set(row.id, revised?.groomerPayCents === row.revisedPayCents
      ? postPayoutBreakdown(details?.baseline.get(employeeKey(row.employeeName)), revised, row.amountCents, row.baselinePayCents)
      : null);
  }
  return breakdowns;
}
