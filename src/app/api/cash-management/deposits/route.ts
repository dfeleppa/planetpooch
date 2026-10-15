import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { cashOnHandCents, MOBILE_GROOMING_SOURCE } from "@/lib/cash-management";
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
  if (source !== MOBILE_GROOMING_SOURCE || typeof amountCents !== "number" ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647 ||
      typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "Enter a valid Mobile Grooming deposit amount." }, { status: 400 });
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
      const [payroll, banked] = await Promise.all([
        tx.financeMobileGroomingWeeklyCloseout.aggregate({ _sum: { finalDepositCents: true } }),
        tx.financeCashBankDeposit.aggregate({
          where: { source: MOBILE_GROOMING_SOURCE }, _sum: { amountCents: true },
        }),
      ]);
      const available = cashOnHandCents(payroll._sum.finalDepositCents ?? 0, banked._sum.amountCents ?? 0);
      if (amountCents > available) return { error: "Deposit exceeds Mobile Grooming cash on hand." };
      const deposit = await tx.financeCashBankDeposit.create({
        data: {
          source: MOBILE_GROOMING_SOURCE,
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
