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

type PayComponents = {
  groomerPayCents: number;
  commissionPayCents: number;
  creditCardTipCents: number;
  basePayCents: number;
  payKind: string | null;
};

function payComponents(value: unknown): PayComponents | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (![row.groomerPayCents, row.commissionPayCents, row.creditCardTipCents, row.basePayCents]
    .every((amount) => typeof amount === "number" && Number.isSafeInteger(amount))) return null;
  if (row.payKind !== null && row.payKind !== "fixed" && row.payKind !== "additive") return null;
  const components = row as PayComponents;
  const commissionContribution = components.payKind === "fixed" ? 0 : components.commissionPayCents;
  if (components.groomerPayCents !== commissionContribution + components.basePayCents) return null;
  return components;
}

/** Itemize the pay difference from the immutable paid snapshot. */
export function postPayoutBreakdown(baseline: unknown, revised: unknown, adjustmentCents: number, baselinePayCents?: number) {
  const before = payComponents(baseline);
  const after = payComponents(revised);
  if (!before || !after || (baselinePayCents !== undefined && before.groomerPayCents !== baselinePayCents)) return null;
  const commission = (value: PayComponents) => value.payKind === "fixed" ? 0 : value.commissionPayCents;
  const tips = (value: PayComponents) => value.payKind === "fixed" ? 0 : value.creditCardTipCents;
  const lines = [
    { reason: "Grooming commission", amountCents: (commission(after) - tips(after)) - (commission(before) - tips(before)) },
    { reason: "Credit card tips", amountCents: tips(after) - tips(before) },
    { reason: "Base pay", amountCents: after.basePayCents - before.basePayCents },
  ].filter((line) => line.amountCents !== 0);
  const carriedCents = adjustmentCents - lines.reduce((sum, line) => sum + line.amountCents, 0);
  if (carriedCents !== 0) lines.push({ reason: "Correction already carried to another pay week", amountCents: carriedCents });
  return lines;
}

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

/** Recalculate unpaid earned pay against employee locks and legacy weekly closeouts. */
export async function reconcilePostPayoutChanges(
  tx: Prisma.TransactionClient,
  sourcePayrollWeekId: string,
  sourceWeekStart: Date,
  entries: PayrollEntry[],
  now = new Date()
) {
  const [closeout, locks] = await Promise.all([
    tx.financeMobileGroomingWeeklyCloseout.findUnique({
      where: { payrollWeekId: sourcePayrollWeekId }, select: { payoutSnapshot: true },
    }),
    tx.financeMobileGroomingPayLock.findMany({
      where: { payrollWeekId: sourcePayrollWeekId },
      select: { employeeName: true, earnedPayCents: true },
    }),
  ]);
  if (!closeout && locks.length === 0) return { checkedCount: 0, lockedCount: 0, discrepancyCount: 0 };

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
  const baseline = new Map((closeout ? payoutSnapshot(closeout.payoutSnapshot) : [])
    .map((payout) => [keyFor(payout.employeeName), payout]));
  for (const lock of locks) baseline.set(keyFor(lock.employeeName), {
    employeeName: lock.employeeName, groomerPayCents: lock.earnedPayCents,
  });
  const revisedToCheck = closeout ? revised : revised.filter((payout) => baseline.has(keyFor(payout.employeeName)));
  const changes = earnedPayChanges(
    [...baseline.values()], revisedToCheck,
    existing.filter((row) => baseline.has(keyFor(row.employeeName))).map((row) => row.employeeName)
  ).filter((change) => baseline.has(keyFor(change.employeeName)) || Boolean(closeout));
  const discrepancyCount = changes.filter((change) => change.amountCents !== 0).length;
  if (changes.every((change) => change.amountCents === 0) && existing.length === 0) {
    return { checkedCount: baseline.size, lockedCount: locks.length, discrepancyCount };
  }

  for (const change of changes) {
    const key = keyFor(change.employeeName);
    const applied = existing.filter((row) => keyFor(row.employeeName) === key)
      .reduce((sum, row) => sum + row.amountCents, 0);
    const delta = outstandingPayCorrection(change.amountCents, applied);
    if (delta === 0) continue;
    let targetWeekStart = currentEasternWeekStart(now);
    if (targetWeekStart <= sourceWeekStart) {
      targetWeekStart = new Date(sourceWeekStart.getTime() + 7 * MS_PER_DAY);
    }
    // Do not change a pay week after this employee's payout was locked.
    for (;;) {
      const target = await tx.financePayrollWeek.findUnique({
        where: { business_weekStart: { business: "mobile-grooming", weekStart: targetWeekStart } },
        select: { id: true, mobileGroomingCloseout: { select: { id: true } } },
      });
      const payLocked = target && await tx.financeMobileGroomingPayLock.findFirst({
        where: { payrollWeekId: target.id, employeeName: { equals: change.employeeName, mode: "insensitive" } },
        select: { id: true },
      });
      if (!target?.mobileGroomingCloseout && !payLocked) break;
      targetWeekStart = new Date(targetWeekStart.getTime() + 7 * MS_PER_DAY);
    }
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
  return { checkedCount: baseline.size, lockedCount: locks.length, discrepancyCount };
}
