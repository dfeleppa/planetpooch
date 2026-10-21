import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { normalizeEmployeeName } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

async function authorized() {
  const session = await getSession();
  return Boolean(session?.user && isSuperAdmin((session.user as { role?: string }).role));
}

export async function PUT(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const employeeName = normalizeEmployeeName(typeof body.employeeName === "string" ? body.employeeName : "");
  const amountCents = body.amountCents;
  const weekStartText = body.weekStart;
  const weekStart = typeof weekStartText === "string" && /^\d{4}-\d{2}-\d{2}$/.test(weekStartText)
    ? new Date(`${weekStartText}T00:00:00.000Z`) : null;
  if (
    !employeeName || employeeName.length > 200 ||
    !weekStart || Number.isNaN(weekStart.getTime()) || weekStart.toISOString().slice(0, 10) !== weekStartText || weekStart.getUTCDay() !== 6 ||
    typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) ||
    amountCents < 0 || amountCents > 2_147_483_647
  ) {
    return NextResponse.json({ error: "A valid employee and direct deposit amount are required." }, { status: 400 });
  }

  const [payrollEntry, payRule, carriedAdjustment] = await Promise.all([
    prisma.financeMobileGroomingPayrollEntry.findFirst({
      where: { employeeName: { equals: employeeName, mode: "insensitive" }, payrollWeek: { business: "mobile-grooming", weekStart } },
      select: { employeeName: true },
    }),
    prisma.financeMobileGroomingPayRule.findFirst({
      where: { employeeName: { equals: employeeName, mode: "insensitive" }, effectiveWeekStart: { lte: weekStart } },
      orderBy: { effectiveWeekStart: "desc" },
      select: { employeeName: true },
    }),
    prisma.financeMobileGroomingPostPayoutAdjustment.findFirst({
      where: { employeeName: { equals: employeeName, mode: "insensitive" }, targetWeekStart: weekStart, amountCents: { not: 0 } },
      select: { employeeName: true },
    }),
  ]);
  if (!payrollEntry && !payRule && !carriedAdjustment) {
    return NextResponse.json({ error: "No mobile grooming payroll entry or base pay exists for this employee." }, { status: 404 });
  }

  const canonicalName = normalizeEmployeeName(payRule?.employeeName ?? payrollEntry?.employeeName ?? carriedAdjustment!.employeeName);
  const setting = await prisma.financeMobileGroomingDirectDeposit.upsert({
    where: { employeeName_effectiveWeekStart: { employeeName: canonicalName, effectiveWeekStart: weekStart } },
    create: { employeeName: canonicalName, effectiveWeekStart: weekStart, amountCents },
    update: { amountCents },
    select: { employeeName: true, amountCents: true },
  });
  return NextResponse.json({ setting });
}
