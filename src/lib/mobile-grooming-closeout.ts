import { createHash } from "node:crypto";
import { normalizeEmployeeName } from "@/lib/payroll";

type Entry = {
  serviceDate: Date;
  employeeName: string;
  paymentType: string;
  dogs: number;
  priceCents: number;
  upgradeCents: number;
  creditCardTipCents: number;
  discountCents: number;
};

type Reconciliation = {
  serviceDate: Date;
  employeeName: string;
  expectedCashCents: number;
  countedCashCents: number;
};

type Setting = { employeeName: string; amountCents: number };
type Adjustment = { employeeName: string; amountCents: number; note: string };
type VarianceReview = { employeeName: string; varianceCents: number; sourceFingerprint: string; applyToCashPayout: boolean };

export function mobileGroomingCloseoutPreview(
  entries: Entry[],
  reconciliations: Reconciliation[],
  settings: Setting[],
  adjustments: Adjustment[] = [],
  varianceReviews: VarianceReview[] = []
) {
  const days = new Map<string, { employeeName: string; serviceDate: string; expectedCashCents: number }>();
  const employees = new Map<string, {
    employeeName: string;
    commissionBaseCents: number;
    creditCardTipCents: number;
  }>();
  const settingByName = new Map(settings.map((setting) => [
    normalizeEmployeeName(setting.employeeName).toLocaleLowerCase(), setting.amountCents,
  ]));
  const adjustmentByName = new Map(adjustments.map((adjustment) => [
    normalizeEmployeeName(adjustment.employeeName).toLocaleLowerCase(), adjustment,
  ]));
  const reviewByName = new Map(varianceReviews.map((review) => [
    normalizeEmployeeName(review.employeeName).toLocaleLowerCase(), review,
  ]));

  for (const entry of entries) {
    const employeeName = normalizeEmployeeName(entry.employeeName);
    const key = employeeName.toLocaleLowerCase();
    const serviceDate = entry.serviceDate.toISOString().slice(0, 10);
    const dayKey = `${key}|${serviceDate}`;
    const day = days.get(dayKey) ?? { employeeName, serviceDate, expectedCashCents: 0 };
    if (entry.paymentType === "cash") {
      day.expectedCashCents += entry.priceCents + entry.upgradeCents - entry.discountCents;
    }
    days.set(dayKey, day);

    const employee = employees.get(key) ?? { employeeName, commissionBaseCents: 0, creditCardTipCents: 0 };
    employee.commissionBaseCents += Math.max(0, entry.priceCents + entry.upgradeCents - entry.dogs * 500);
    employee.creditCardTipCents += entry.creditCardTipCents;
    employees.set(key, employee);
  }

  const records = new Map(reconciliations.map((record) => [
    `${normalizeEmployeeName(record.employeeName).toLocaleLowerCase()}|${record.serviceDate.toISOString().slice(0, 10)}`,
    record,
  ]));
  const missingDays: string[] = [];
  const staleDays: string[] = [];
  let countedCashCents = 0;
  let expectedCashCents = 0;
  const varianceByEmployee = new Map<string, number>();
  for (const [key, day] of days) {
    expectedCashCents += day.expectedCashCents;
    const record = records.get(key);
    if (!record) missingDays.push(`${day.employeeName} — ${day.serviceDate}`);
    else {
      countedCashCents += record.countedCashCents;
      const employeeKey = normalizeEmployeeName(day.employeeName).toLocaleLowerCase();
      varianceByEmployee.set(employeeKey, (varianceByEmployee.get(employeeKey) ?? 0) + record.countedCashCents - record.expectedCashCents);
      if (record.expectedCashCents !== day.expectedCashCents) {
        staleDays.push(`${day.employeeName} — ${day.serviceDate}`);
      }
    }
  }

  const payouts = Array.from(employees, ([key, employee]) => {
    const groomerPayCents = Math.round(employee.commissionBaseCents * 0.4) + employee.creditCardTipCents;
    const directDepositCents = settingByName.get(key) ?? 0;
    const adjustment = adjustmentByName.get(key);
    const adjustmentCents = adjustment?.amountCents ?? 0;
    const varianceCents = varianceByEmployee.get(key) ?? 0;
    const reconciliationFingerprint = createHash("sha256").update(JSON.stringify(
      Array.from(days.entries()).filter(([dayKey]) => dayKey.startsWith(`${key}|`))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dayKey, day]) => ({
          dayKey, expectedCashCents: day.expectedCashCents,
          countedCashCents: records.get(dayKey)?.countedCashCents ?? null,
          reconciledExpectedCashCents: records.get(dayKey)?.expectedCashCents ?? null,
        }))
    )).digest("hex");
    const review = reviewByName.get(key);
    const varianceReviewCurrent = Boolean(review && review.varianceCents === varianceCents && review.sourceFingerprint === reconciliationFingerprint);
    const variancePayoutCents = varianceReviewCurrent && review?.applyToCashPayout && varianceCents > 0 ? varianceCents : 0;
    return {
      employeeName: employee.employeeName,
      groomerPayCents,
      directDepositCents,
      adjustmentCents,
      adjustmentNote: adjustment?.note ?? "",
      varianceCents,
      reconciliationFingerprint,
      varianceReviewed: varianceReviewCurrent,
      applyVarianceToCashPayout: varianceReviewCurrent ? review!.applyToCashPayout && varianceCents > 0 : null,
      variancePayoutCents,
      cashPayoutCents: groomerPayCents - directDepositCents + adjustmentCents + variancePayoutCents,
      directDepositSet: settingByName.has(key),
    };
  }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  const adjustmentCents = payouts.reduce((sum, payout) => sum + payout.adjustmentCents, 0);
  const cashPayoutCents = payouts.reduce((sum, payout) => sum + payout.cashPayoutCents, 0);
  const expectedDepositCents = countedCashCents - cashPayoutCents;
  const missingDepositSettings = payouts.filter((payout) => !payout.directDepositSet).map((payout) => payout.employeeName);
  const negativeCashPayouts = payouts.filter((payout) => payout.cashPayoutCents < 0).map((payout) => payout.employeeName);
  const pendingVarianceReviews = payouts.filter((payout) => !payout.varianceReviewed).map((payout) => payout.employeeName);

  const fingerprintInput = {
    days: Array.from(days).sort(([a], [b]) => a.localeCompare(b)).map(([key, day]) => ({
      key, expectedCashCents: day.expectedCashCents,
      countedCashCents: records.get(key)?.countedCashCents ?? null,
      reconciledExpectedCashCents: records.get(key)?.expectedCashCents ?? null,
    })),
    payouts: payouts.map((payout) => ({
      employeeName: payout.employeeName,
      groomerPayCents: payout.groomerPayCents,
      directDepositCents: payout.directDepositCents,
      cashPayoutCents: payout.cashPayoutCents,
      directDepositSet: payout.directDepositSet,
      ...(payout.adjustmentCents !== 0 || payout.adjustmentNote
        ? { adjustmentCents: payout.adjustmentCents, adjustmentNote: payout.adjustmentNote }
        : {}),
      ...(payout.varianceReviewed ? {
        varianceCents: payout.varianceCents,
        applyVarianceToCashPayout: payout.applyVarianceToCashPayout,
      } : {}),
    })),
  };
  const sourceFingerprint = createHash("sha256").update(JSON.stringify(fingerprintInput)).digest("hex");

  return {
    expectedCashCents,
    countedCashCents,
    adjustmentCents,
    cashPayoutCents,
    expectedDepositCents,
    payouts,
    workedDays: days.size,
    reconciledDays: days.size - missingDays.length,
    missingDays,
    staleDays,
    missingDepositSettings,
    negativeCashPayouts,
    pendingVarianceReviews,
    sourceFingerprint,
  };
}
