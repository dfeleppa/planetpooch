import { prisma } from "@/lib/prisma";

export const SAFE_CENTS = 250_000;
export const MOBILE_GROOMING_SOURCE = "mobile-grooming";

export function cashOnHandCents(payrollCents: number, depositedCents: number) {
  return payrollCents - depositedCents;
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
