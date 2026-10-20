import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { cashOnHandCents, petResortOnHandCents, MOBILE_GROOMING_SOURCE, PET_RESORT_SOURCE } from "@/lib/cash-management";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  const userId = user?.id;
  if (!userId || !isSuperAdmin(user?.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const { source, amountCents, requestId } = body;
  if ((source !== MOBILE_GROOMING_SOURCE && source !== PET_RESORT_SOURCE) || typeof amountCents !== "number" ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647 ||
      typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "Enter a valid deposit amount and source." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Serialize deposits so two requests cannot both spend the same cash.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261015, 1)::text`;
      const existing = await tx.financeCashBankDeposit.findUnique({ where: { requestId } });
      if (existing) {
        if (existing.source !== source || existing.amountCents !== amountCents) {
          return { error: "Deposit request changed. Refresh and try again." };
        }
        return { id: existing.id, duplicate: true };
      }
      const [received, dailyCash, pendingCounted, banked, adjustments] = await Promise.all([
        source === MOBILE_GROOMING_SOURCE
          ? tx.financeMobileGroomingWeeklyCloseout.aggregate({ _sum: { finalDepositCents: true } }).then((result) => result._sum.finalDepositCents ?? 0)
          : tx.financePetResortCashTransaction.aggregate({ _sum: { amountCents: true } }).then((result) => result._sum.amountCents ?? 0),
        source === PET_RESORT_SOURCE
          ? tx.financePetResortDailyCash.aggregate({ _sum: { amountCents: true } }).then((result) => result._sum.amountCents ?? 0)
          : Promise.resolve(0),
        source === MOBILE_GROOMING_SOURCE
          ? tx.financeMobileGroomingDailyReconciliation.aggregate({
              where: { payrollWeek: { business: MOBILE_GROOMING_SOURCE, mobileGroomingCloseout: { is: null } } },
              _sum: { countedCashCents: true },
            }).then((result) => result._sum.countedCashCents ?? 0)
          : Promise.resolve(0),
        tx.financeCashBankDeposit.aggregate({
          where: { source }, _sum: { amountCents: true },
        }),
        source === MOBILE_GROOMING_SOURCE
          ? tx.financeMobileGroomingCashAdjustment.aggregate({ _sum: { amountCents: true } })
              .then((result) => result._sum.amountCents ?? 0)
          : Promise.resolve(0),
      ]);
      const available = source === PET_RESORT_SOURCE
        ? petResortOnHandCents(received, dailyCash, banked._sum.amountCents ?? 0)
        : cashOnHandCents(received, pendingCounted, banked._sum.amountCents ?? 0, adjustments);
      if (amountCents > available) return { error: "Deposit exceeds cash on hand." };
      const deposit = await tx.financeCashBankDeposit.create({
        data: {
          source,
          amountCents,
          requestId,
          recordedById: userId,
        },
      });
      return { id: deposit.id, duplicate: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if ("error" in result) return NextResponse.json(result, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Cash balance changed. Refresh and try again." }, { status: 409 });
    }
    throw error;
  }
}
