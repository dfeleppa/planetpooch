import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PET_RESORT_SOURCE, petResortOnHandCents } from "@/lib/cash-management";

export async function POST(request: Request) {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || !isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { cashDate, amountCents, note, requestId } = body;
  const date = typeof cashDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cashDate)
    ? new Date(`${cashDate}T00:00:00.000Z`) : null;
  if (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== cashDate ||
      typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) ||
      amountCents <= 0 || amountCents > 2_147_483_647 ||
      typeof note !== "string" || note.trim().length > 2000 ||
      typeof requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(requestId)) {
    return NextResponse.json({ error: "Enter a valid date, cash amount, and note (up to 2,000 characters)." }, { status: 400 });
  }

  const trimmedNote = note.trim();
  try {
    const existing = await prisma.financePetResortDailyCash.findUnique({ where: { requestId } });
    if (existing) {
      if (existing.cashDate.getTime() !== date.getTime() || existing.amountCents !== amountCents || existing.note !== trimmedNote) {
        return NextResponse.json({ error: "Cash entry request changed. Refresh and try again." }, { status: 409 });
      }
      return NextResponse.json({ id: existing.id, duplicate: true });
    }
    const entry = await prisma.financePetResortDailyCash.create({
      data: { cashDate: date, amountCents, note: trimmedNote, recordedById: user.id, requestId },
    });
    return NextResponse.json({ id: entry.id, duplicate: false });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.financePetResortDailyCash.findUnique({ where: { requestId } });
      if (existing && existing.cashDate.getTime() === date.getTime() && existing.amountCents === amountCents && existing.note === trimmedNote) {
        return NextResponse.json({ id: existing.id, duplicate: true });
      }
      return NextResponse.json({ error: "Cash entry request changed. Refresh and try again." }, { status: 409 });
    }
    throw error;
  }
}

export async function PATCH(request: Request) {
  const session = await getSession();
  const user = session?.user as { id?: string; role?: string } | undefined;
  if (!user?.id || !isSuperAdmin(user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return NextResponse.json({ error: "Invalid request." }, { status: 400 }); }

  const { id, cashDate, amountCents, note, original } = body;
  const date = typeof cashDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(cashDate)
    ? new Date(`${cashDate}T00:00:00.000Z`) : null;
  const prior = original && typeof original === "object" ? original as Record<string, unknown> : null;
  if (typeof id !== "string" || !id || !date || Number.isNaN(date.getTime()) ||
      date.toISOString().slice(0, 10) !== cashDate || typeof amountCents !== "number" ||
      !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647 ||
      typeof note !== "string" || note.trim().length > 2000 || !prior ||
      typeof prior.cashDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(prior.cashDate) ||
      typeof prior.amountCents !== "number" || !Number.isSafeInteger(prior.amountCents) ||
      typeof prior.note !== "string") {
    return NextResponse.json({ error: "Enter a valid date, cash amount, and note (up to 2,000 characters)." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Use the same lock as bank deposits so a correction cannot overdraw cash on hand.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(20261015, 1)::text`;
      const entry = await tx.financePetResortDailyCash.findUnique({ where: { id } });
      if (!entry || entry.cashDate.toISOString().slice(0, 10) !== prior.cashDate ||
          entry.amountCents !== prior.amountCents || entry.note !== prior.note) {
        return { error: "Cash entry changed. Refresh and try again." };
      }
      if (amountCents < entry.amountCents) {
        const [received, dailyCash, banked] = await Promise.all([
          tx.financePetResortCashTransaction.aggregate({ _sum: { amountCents: true } }),
          tx.financePetResortDailyCash.aggregate({ _sum: { amountCents: true } }),
          tx.financeCashBankDeposit.aggregate({ where: { source: PET_RESORT_SOURCE }, _sum: { amountCents: true } }),
        ]);
        const available = petResortOnHandCents(received._sum.amountCents ?? 0,
          dailyCash._sum.amountCents ?? 0, banked._sum.amountCents ?? 0);
        if (available < entry.amountCents - amountCents) {
          return { error: "This correction would exceed Pet Resort cash on hand." };
        }
      }
      await tx.financePetResortDailyCash.update({ where: { id }, data: { cashDate: date, amountCents, note: note.trim() } });
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
