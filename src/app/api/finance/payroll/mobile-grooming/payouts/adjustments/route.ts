import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { normalizeEmployeeName } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

async function authorized() {
  const session = await getSession();
  return Boolean(session?.user && isSuperAdmin((session.user as { role?: string }).role));
}

function weekStartParam(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 6
    ? null : date;
}

export async function PUT(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const weekStart = weekStartParam(body.weekStart);
  const employeeName = normalizeEmployeeName(typeof body.employeeName === "string" ? body.employeeName : "");
  const amountCents = body.amountCents;
  const note = body.note;
  if (
    !weekStart || !employeeName || employeeName.length > 200 ||
    typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) ||
    Math.abs(amountCents) > 2_147_483_647 ||
    typeof note !== "string" || note.trim().length > 1000 ||
    (amountCents !== 0 && !note.trim())
  ) {
    return NextResponse.json({ error: "Enter a signed adjustment and a note for any nonzero amount." }, { status: 400 });
  }

  const [existingWeek, payRule, carriedAdjustment] = await Promise.all([
    prisma.financePayrollWeek.findUnique({
      where: { business_weekStart: { business: "mobile-grooming", weekStart } },
      select: { id: true, mobileGroomingEntries: { select: { employeeName: true } } },
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
  const matchingEntry = existingWeek?.mobileGroomingEntries.find((entry) =>
    normalizeEmployeeName(entry.employeeName).toLocaleLowerCase() === employeeName.toLocaleLowerCase()
  );
  if (!matchingEntry && !payRule && !carriedAdjustment) {
    return NextResponse.json({ error: "No saved mobile grooming payroll exists for this employee and week." }, { status: 404 });
  }
  const week = existingWeek ?? await prisma.financePayrollWeek.upsert({
    where: { business_weekStart: { business: "mobile-grooming", weekStart } },
    create: {
      business: "mobile-grooming",
      weekStart,
      weekEnd: new Date(weekStart.getTime() + 6 * 86_400_000),
    },
    update: {},
    select: { id: true },
  });

  const canonicalName = normalizeEmployeeName(payRule?.employeeName ?? matchingEntry?.employeeName ?? carriedAdjustment!.employeeName);
  const normalizedNote = amountCents === 0 ? "" : note.trim();
  const adjustment = await prisma.financeMobileGroomingPayoutAdjustment.upsert({
    where: { payrollWeekId_employeeName: { payrollWeekId: week.id, employeeName: canonicalName } },
    create: { payrollWeekId: week.id, employeeName: canonicalName, amountCents, note: normalizedNote },
    update: { amountCents, note: normalizedNote },
    select: { employeeName: true, amountCents: true, note: true },
  });
  return NextResponse.json({ adjustment });
}
