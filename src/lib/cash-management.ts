import { prisma } from "@/lib/prisma";

export const SAFE_CENTS = 250_000;
export const MOBILE_GROOMING_SOURCE = "mobile-grooming";
export const PET_RESORT_SOURCE = "pet-resort";

export function cashOnHandCents(payrollCents: number, pendingCountedCents: number, depositedCents: number, adjustmentCents = 0) {
  return payrollCents + pendingCountedCents + adjustmentCents - depositedCents;
}

export function petResortOnHandCents(importedCents: number, dailyCashCents: number, bankedCents: number) {
  return importedCents + dailyCashCents - bankedCents;
}

type PendingCount = {
  id: string;
  serviceDate: Date;
  reconciledAt: Date;
  employeeName: string;
  countedCashCents: number;
  payrollWeek: { weekStart: Date; weekEnd: Date };
};
type CompletedWeek = {
  id: string;
  countedCashCents: number;
  cashPayoutCents: number;
  expectedDepositCents: number;
  finalDepositCents: number;
  note: string;
  payrollWeek: { weekStart: Date; weekEnd: Date };
};
type BankDeposit = { id: string; amountCents: number; depositedAt: Date };
type ManualAdjustment = { id: string; amountCents: number; note: string; recordedAt: Date };

export type MobileCashLedgerEntry = {
  id: string;
  kind: "counted" | "completed" | "adjustment" | "manual" | "bank";
  occurredAt: string;
  amountCents: number;
  balanceCents: number;
  label: string;
  detail: string;
};

function dateOnly(date: Date) { return date.toISOString().slice(0, 10); }
function ledgerMoney(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function buildMobileCashLedger(pending: PendingCount[], completed: CompletedWeek[], deposits: BankDeposit[], adjustments: ManualAdjustment[] = []): MobileCashLedgerEntry[] {
  const entries: Omit<MobileCashLedgerEntry, "balanceCents">[] = [
    ...pending.map((row) => ({
      id: `counted-${row.id}`, kind: "counted" as const, occurredAt: row.reconciledAt.toISOString(),
      amountCents: row.countedCashCents, label: "Counted cash awaiting closeout",
      detail: `${row.employeeName} · Service date ${dateOnly(row.serviceDate)} · Week ${dateOnly(row.payrollWeek.weekStart)}–${dateOnly(row.payrollWeek.weekEnd)}`,
    })),
    ...completed.flatMap((week) => [
      {
        id: `completed-${week.id}`, kind: "completed" as const, occurredAt: week.payrollWeek.weekEnd.toISOString(),
        amountCents: week.expectedDepositCents, label: "Completed week · net cash",
        detail: `Week ${dateOnly(week.payrollWeek.weekStart)}–${dateOnly(week.payrollWeek.weekEnd)} · ${ledgerMoney(week.countedCashCents)} collected − ${ledgerMoney(week.cashPayoutCents)} employee payouts`,
      },
      ...(week.finalDepositCents === week.expectedDepositCents ? [] : [{
        id: `adjustment-${week.id}`, kind: "adjustment" as const, occurredAt: week.payrollWeek.weekEnd.toISOString(),
        amountCents: week.finalDepositCents - week.expectedDepositCents, label: "Closeout adjustment",
        detail: `Week ${dateOnly(week.payrollWeek.weekStart)}–${dateOnly(week.payrollWeek.weekEnd)}${week.note ? ` · ${week.note}` : ""}`,
      }]),
    ]),
    ...deposits.map((deposit) => ({
      id: `bank-${deposit.id}`, kind: "bank" as const, occurredAt: deposit.depositedAt.toISOString(),
      amountCents: -deposit.amountCents, label: "Removed for bank deposit", detail: "Bank deposit recorded",
    })),
    ...adjustments.map((adjustment) => ({
      id: `manual-${adjustment.id}`, kind: "manual" as const, occurredAt: adjustment.recordedAt.toISOString(),
      amountCents: adjustment.amountCents, label: "Cash adjustment", detail: adjustment.note,
    })),
  ];
  const order = { counted: 0, completed: 1, adjustment: 2, manual: 3, bank: 4 };
  entries.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt) || order[a.kind] - order[b.kind] || a.id.localeCompare(b.id));
  let balanceCents = 0;
  return entries.map((entry) => ({ ...entry, balanceCents: balanceCents += entry.amountCents })).reverse();
}

export async function mobileGroomingCashSummary(db: Pick<typeof prisma, "financeMobileGroomingWeeklyCloseout" | "financeMobileGroomingDailyReconciliation" | "financeCashBankDeposit" | "financeMobileGroomingCashAdjustment"> = prisma) {
  const [completed, pending, deposits, adjustments] = await Promise.all([
    db.financeMobileGroomingWeeklyCloseout.findMany({
      select: { id: true, countedCashCents: true, cashPayoutCents: true, expectedDepositCents: true,
        finalDepositCents: true, note: true,
        payrollWeek: { select: { weekStart: true, weekEnd: true } } },
    }),
    db.financeMobileGroomingDailyReconciliation.findMany({
      where: { payrollWeek: { business: MOBILE_GROOMING_SOURCE, mobileGroomingCloseout: { is: null } } },
      select: { id: true, serviceDate: true, reconciledAt: true, employeeName: true, countedCashCents: true,
        payrollWeek: { select: { weekStart: true, weekEnd: true } } },
    }),
    db.financeCashBankDeposit.findMany({
      where: { source: MOBILE_GROOMING_SOURCE },
      select: { id: true, amountCents: true, depositedAt: true },
    }),
    db.financeMobileGroomingCashAdjustment.findMany({
      select: { id: true, amountCents: true, note: true, recordedAt: true },
    }),
  ]);
  const payrollCents = completed.reduce((sum, week) => sum + week.finalDepositCents, 0);
  const pendingCountedCents = pending.reduce((sum, row) => sum + row.countedCashCents, 0);
  const bankedCents = deposits.reduce((sum, deposit) => sum + deposit.amountCents, 0);
  const adjustmentCents = adjustments.reduce((sum, adjustment) => sum + adjustment.amountCents, 0);
  return {
    payrollCents,
    pendingCountedCents,
    bankedCents,
    adjustmentCents,
    onHandCents: cashOnHandCents(payrollCents, pendingCountedCents, bankedCents, adjustmentCents),
    ledger: buildMobileCashLedger(pending, completed, deposits, adjustments),
  };
}

export async function petResortCashSummary(db: Pick<typeof prisma, "financePetResortCashTransaction" | "financePetResortDailyCash" | "financeCashBankDeposit"> = prisma) {
  const [received, dailyCash, deposited, transactionCount, recentDailyCash, recentDeposits] = await Promise.all([
    db.financePetResortCashTransaction.aggregate({ _sum: { amountCents: true } }),
    db.financePetResortDailyCash.aggregate({ _sum: { amountCents: true } }),
    db.financeCashBankDeposit.aggregate({ where: { source: PET_RESORT_SOURCE }, _sum: { amountCents: true } }),
    db.financePetResortCashTransaction.count(),
    db.financePetResortDailyCash.findMany({
      orderBy: [{ cashDate: "desc" }, { recordedAt: "desc" }], take: 30,
      select: { id: true, cashDate: true, amountCents: true, note: true },
    }),
    db.financeCashBankDeposit.findMany({
      where: { source: PET_RESORT_SOURCE }, orderBy: { depositedAt: "desc" }, take: 10,
      select: { id: true, amountCents: true, depositedAt: true },
    }),
  ]);
  const receivedCents = received._sum.amountCents ?? 0;
  const dailyCashCents = dailyCash._sum.amountCents ?? 0;
  const bankedCents = deposited._sum.amountCents ?? 0;
  return {
    receivedCents,
    dailyCashCents,
    bankedCents,
    onHandCents: petResortOnHandCents(receivedCents, dailyCashCents, bankedCents),
    transactionCount,
    recentDailyCash: recentDailyCash.map((entry) => ({
      id: entry.id, cashDate: entry.cashDate.toISOString().slice(0, 10), amountCents: entry.amountCents, note: entry.note,
    })),
    recentDeposits: recentDeposits.map((deposit) => ({
      id: deposit.id, amountCents: deposit.amountCents, depositedAt: deposit.depositedAt.toISOString(),
    })),
  };
}
