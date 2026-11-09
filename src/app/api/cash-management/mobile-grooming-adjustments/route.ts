import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { cashOnHandCents, MOBILE_GROOMING_SOURCE } from "@/lib/cash-management";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || !isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { direction, amountCents, note, requestId } = body;
  if ((direction !== "add" && direction !== "remove") || typeof amountCents !== "number" ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647 ||
      typeof note !== "string" || note.trim().length < 1 || note.trim().length > 1000 ||
      typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "Enter an adjustment direction, amount, and reason (up to 1,000 characters)." }, { status: 400 });
  }
  const signedAmountCents = direction === "add" ? amountCents : -amountCents;
  const trimmedNote = note.trim();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Share the bank-deposit lock so cash cannot be removed twice from one balance.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261015, 1)::text`;
      const existing = await tx.financeMobileGroomingCashAdjustment.findUnique({ where: { requestId } });
      if (existing) {
        if (existing.amountCents !== signedAmountCents || existing.note !== trimmedNote) {
          return { error: "Adjustment request changed. Refresh and try again." };
        }
        return { id: existing.id, duplicate: true };
      }
      if (signedAmountCents < 0) {
        const [payroll, pending, banked, adjustments] = await Promise.all([
          tx.financeMobileGroomingWeeklyCloseout.aggregate({ _sum: { finalDepositCents: true } }),
          tx.financeMobileGroomingDailyReconciliation.aggregate({
            where: { payrollWeek: { business: MOBILE_GROOMING_SOURCE, mobileGroomingCloseout: { is: null } } },
            _sum: { countedCashCents: true },
          }),
          tx.financeCashBankDeposit.aggregate({
            where: { source: MOBILE_GROOMING_SOURCE }, _sum: { amountCents: true },
          }),
          tx.financeMobileGroomingCashAdjustment.aggregate({ _sum: { amountCents: true } }),
        ]);
        const available = cashOnHandCents(payroll._sum.finalDepositCents ?? 0,
          pending._sum.countedCashCents ?? 0, banked._sum.amountCents ?? 0,
          adjustments._sum.amountCents ?? 0);
        if (-signedAmountCents > available) return { error: "Adjustment exceeds Mobile Grooming cash on hand." };
      }
      const adjustment = await tx.financeMobileGroomingCashAdjustment.create({
        data: { amountCents: signedAmountCents, note: trimmedNote, recordedById: user.id!, requestId },
      });
      return { id: adjustment.id, duplicate: false };
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

async function changeAdjustment(request: Request, deleting: boolean) {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || !isSuperAdmin(user.role)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }
  const { id, original } = body;
  const { direction, amountCents, note } = deleting ? { direction: "add", amountCents: 1, note: "Delete" } : body;
  const prior = original && typeof original === "object" ? original as Record<string, unknown> : null;
  if (typeof id !== "string" || !id || (direction !== "add" && direction !== "remove") ||
      typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647 ||
      typeof note !== "string" || !note.trim() || note.trim().length > 1000 || !prior ||
      typeof prior.amountCents !== "number" || !Number.isSafeInteger(prior.amountCents) || typeof prior.note !== "string") {
    return NextResponse.json({ error: "Enter a valid direction, amount, and reason (up to 1,000 characters)." }, { status: 400 });
  }
  const signedAmountCents = deleting ? 0 : direction === "add" ? amountCents : -amountCents;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261015, 1)::text`;
      const existing = await tx.financeMobileGroomingCashAdjustment.findUnique({ where: { id } });
      if (!existing || existing.amountCents !== prior.amountCents || existing.note !== prior.note) {
        return { error: "Adjustment changed. Refresh and try again." };
      }
      const decrease = existing.amountCents - signedAmountCents;
      if (decrease > 0) {
        const [payroll, pending, banked, adjustments] = await Promise.all([
          tx.financeMobileGroomingWeeklyCloseout.aggregate({ _sum: { finalDepositCents: true } }),
          tx.financeMobileGroomingDailyReconciliation.aggregate({
            where: { payrollWeek: { business: MOBILE_GROOMING_SOURCE, mobileGroomingCloseout: { is: null } } },
            _sum: { countedCashCents: true },
          }),
          tx.financeCashBankDeposit.aggregate({
            where: { source: MOBILE_GROOMING_SOURCE }, _sum: { amountCents: true },
          }),
          tx.financeMobileGroomingCashAdjustment.aggregate({ _sum: { amountCents: true } }),
        ]);
        const available = cashOnHandCents(payroll._sum.finalDepositCents ?? 0,
          pending._sum.countedCashCents ?? 0, banked._sum.amountCents ?? 0,
          adjustments._sum.amountCents ?? 0);
        if (decrease > available) return { error: "This change exceeds Mobile Grooming cash on hand." };
      }
      if (deleting) await tx.financeMobileGroomingCashAdjustment.delete({ where: { id } });
      else await tx.financeMobileGroomingCashAdjustment.update({ where: { id }, data: { amountCents: signedAmountCents, note: note.trim() } });
      return { id };
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

export async function PATCH(request: Request) { return changeAdjustment(request, false); }
export async function DELETE(request: Request) { return changeAdjustment(request, true); }
