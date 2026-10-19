import { prisma } from "@/lib/prisma";

export const SAFE_CENTS = 250_000;
export const MOBILE_GROOMING_SOURCE = "mobile-grooming";
export const PET_RESORT_SOURCE = "pet-resort";

export function cashOnHandCents(payrollCents: number, depositedCents: number) {
  return payrollCents - depositedCents;
}

export function petResortOnHandCents(importedCents: number, dailyCashCents: number, bankedCents: number) {
  return importedCents + dailyCashCents - bankedCents;
}

export async function mobileGroomingCashSummary(db: Pick<typeof prisma, "financeMobileGroomingWeeklyCloseout" | "financeCashBankDeposit"> = prisma) {
  const [payroll, deposited, recentDeposits] = await Promise.all([
    db.financeMobileGroomingWeeklyCloseout.aggregate({ _sum: { finalDepositCents: true } }),
    db.financeCashBankDeposit.aggregate({
      where: { source: MOBILE_GROOMING_SOURCE },
      _sum: { amountCents: true },
    }),
    db.financeCashBankDeposit.findMany({
      where: { source: MOBILE_GROOMING_SOURCE },
      orderBy: { depositedAt: "desc" },
      take: 10,
      select: { id: true, amountCents: true, depositedAt: true },
    }),
  ]);
  const payrollCents = payroll._sum.finalDepositCents ?? 0;
  const bankedCents = deposited._sum.amountCents ?? 0;
  return {
    payrollCents,
    bankedCents,
    onHandCents: cashOnHandCents(payrollCents, bankedCents),
    recentDeposits: recentDeposits.map((deposit) => ({
      id: deposit.id,
      amountCents: deposit.amountCents,
      depositedAt: deposit.depositedAt.toISOString(),
    })),
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
