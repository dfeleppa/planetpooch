import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
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
