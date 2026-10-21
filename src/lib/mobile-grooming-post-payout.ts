import type { Prisma } from "@prisma/client";
import { mobileGroomingCloseoutPreview, type MobilePayRule } from "@/lib/mobile-grooming-closeout";
import { normalizeEmployeeName } from "@/lib/payroll";

const MS_PER_DAY = 86_400_000;
const keyFor = (name: string) => normalizeEmployeeName(name).toLocaleLowerCase();

type PayrollEntry = {
  serviceDate: Date;
  employeeName: string;
  paymentType: string;
  dogs: number;
  priceCents: number;
  upgradeCents: number;
  creditCardTipCents: number;
  discountCents: number;
};

type Payout = { employeeName: string; groomerPayCents: number };

export function payoutSnapshot(snapshot: Prisma.JsonValue): Payout[] {
  if (!Array.isArray(snapshot)) throw new Error("The closed payroll payout snapshot is invalid.");
  return snapshot.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value) ||
        typeof value.employeeName !== "string" ||
        typeof value.groomerPayCents !== "number" ||
        !Number.isSafeInteger(value.groomerPayCents)) {
      throw new Error("The closed payroll payout snapshot is invalid.");
    }
    return { employeeName: value.employeeName, groomerPayCents: value.groomerPayCents };
  });
}

export function earnedPayChanges(original: Payout[], revised: Payout[], previouslyCarriedNames: string[] = []) {
  const before = new Map(original.map((item) => [keyFor(item.employeeName), item]));
  const after = new Map(revised.map((item) => [keyFor(item.employeeName), item]));
  const carried = new Map(previouslyCarriedNames.map((name) => [keyFor(name), name]));
  return [...new Set([...before.keys(), ...after.keys(), ...carried.keys()])].map((key) => ({
    employeeName: after.get(key)?.employeeName ?? before.get(key)?.employeeName ?? carried.get(key)!,
    baselinePayCents: before.get(key)?.groomerPayCents ?? 0,
    revisedPayCents: after.get(key)?.groomerPayCents ?? 0,
    amountCents: (after.get(key)?.groomerPayCents ?? 0) - (before.get(key)?.groomerPayCents ?? 0),
  }));
}

export function outstandingPayCorrection(earnedDifferenceCents: number, alreadyCarriedCents: number) {
  return earnedDifferenceCents - alreadyCarriedCents;
}

export function currentEasternWeekStart(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  const date = new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
  return new Date(date.getTime() - ((date.getUTCDay() + 1) % 7) * MS_PER_DAY);
}

/** Recalculate the unpaid difference against the immutable payout at original closeout. */
export async function reconcilePostPayoutChanges(
  tx: Prisma.TransactionClient,
  sourcePayrollWeekId: string,
  sourceWeekStart: Date,
  entries: PayrollEntry[],
  now = new Date()
) {
  const closeout = await tx.financeMobileGroomingWeeklyCloseout.findUnique({
    where: { payrollWeekId: sourcePayrollWeekId }, select: { payoutSnapshot: true },
  });
  if (!closeout) return;

  const rules = await tx.financeMobileGroomingPayRule.findMany({
    where: { effectiveWeekStart: { lte: sourceWeekStart } },
    orderBy: { effectiveWeekStart: "desc" },
    select: { employeeName: true, payKind: true, amountCents: true },
  });
  const latestRules = new Map<string, MobilePayRule>();
  for (const rule of rules) {
    const key = keyFor(rule.employeeName);
    if (!latestRules.has(key) && (rule.payKind === "fixed" || rule.payKind === "additive")) {
      latestRules.set(key, { employeeName: rule.employeeName, payKind: rule.payKind, amountCents: rule.amountCents });
    }
  }
  const revised = mobileGroomingCloseoutPreview(
    entries, [], [], [], [], [...latestRules.values()]
  ).payouts;
  const existing = await tx.financeMobileGroomingPostPayoutAdjustment.findMany({
    where: { sourcePayrollWeekId },
  });
  const changes = earnedPayChanges(
    payoutSnapshot(closeout.payoutSnapshot), revised, existing.map((row) => row.employeeName)
  );
  if (changes.every((change) => change.amountCents === 0) && existing.length === 0) return;

  let targetWeekStart = currentEasternWeekStart(now);
  if (targetWeekStart <= sourceWeekStart) {
    targetWeekStart = new Date(sourceWeekStart.getTime() + 7 * MS_PER_DAY);
  }
  // A completed target is already paid; a later correction belongs in the next open week.
  for (;;) {
    const target = await tx.financePayrollWeek.findUnique({
      where: { business_weekStart: { business: "mobile-grooming", weekStart: targetWeekStart } },
      select: { mobileGroomingCloseout: { select: { id: true } } },
    });
    if (!target?.mobileGroomingCloseout) break;
    targetWeekStart = new Date(targetWeekStart.getTime() + 7 * MS_PER_DAY);
  }

  for (const change of changes) {
    const key = keyFor(change.employeeName);
    const applied = existing.filter((row) => keyFor(row.employeeName) === key)
      .reduce((sum, row) => sum + row.amountCents, 0);
    const delta = outstandingPayCorrection(change.amountCents, applied);
    if (delta === 0) continue;
    const targetRow = existing.find((row) => keyFor(row.employeeName) === key &&
      row.targetWeekStart.getTime() === targetWeekStart.getTime());
    if (targetRow) {
      await tx.financeMobileGroomingPostPayoutAdjustment.update({
        where: { id: targetRow.id },
        data: { amountCents: targetRow.amountCents + delta, revisedPayCents: change.revisedPayCents, detectedAt: now },
      });
    } else {
      await tx.financeMobileGroomingPostPayoutAdjustment.create({
        data: {
          sourcePayrollWeekId, targetWeekStart, employeeName: change.employeeName,
          baselinePayCents: change.baselinePayCents, revisedPayCents: change.revisedPayCents,
          amountCents: delta, detectedAt: now,
        },
      });
    }
    await tx.financeMobileGroomingPayPreparation.updateMany({
      where: { weekStart: targetWeekStart, employeeName: { equals: change.employeeName, mode: "insensitive" } },
      data: { prepared: false },
    });
  }
}
