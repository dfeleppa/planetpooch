import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { normalizeEmployeeName } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

async function authorized() {
  const session = await getSession();
  return Boolean(session?.user && isSuperAdmin((session.user as { role?: string }).role));
}

function dateParam(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : date;
}

function serialize(record: {
  serviceDate: Date;
  employeeName: string;
  expectedCashCents: number;
  countedCashCents: number;
  reconciledAt: Date;
}) {
  return {
    serviceDate: record.serviceDate.toISOString().slice(0, 10),
    employeeName: record.employeeName,
    expectedCashCents: record.expectedCashCents,
    countedCashCents: record.countedCashCents,
    reconciledAt: record.reconciledAt.toISOString(),
  };
}

export async function GET(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const weekStart = dateParam(req.nextUrl.searchParams.get("weekStart"));
  if (!weekStart || weekStart.getUTCDay() !== 6) {
    return NextResponse.json({ error: "A Saturday weekStart is required." }, { status: 400 });
  }
  const week = await prisma.financePayrollWeek.findUnique({
    where: { business_weekStart: { business: "mobile-grooming", weekStart } },
    select: { mobileGroomingReconciliations: true },
  });
  return NextResponse.json({ reconciliations: week?.mobileGroomingReconciliations.map(serialize) ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const weekStart = dateParam(body.weekStart);
  const serviceDate = dateParam(body.serviceDate);
  const employeeName = normalizeEmployeeName(typeof body.employeeName === "string" ? body.employeeName : "");
  const countedCashCents = body.countedCashCents;
  if (
    !weekStart || weekStart.getUTCDay() !== 6 || !serviceDate ||
    serviceDate < weekStart || serviceDate.getTime() > weekStart.getTime() + 6 * 86_400_000 ||
    !employeeName || typeof countedCashCents !== "number" ||
    !Number.isSafeInteger(countedCashCents) || countedCashCents < 0 || countedCashCents > 2_147_483_647
  ) {
    return NextResponse.json({ error: "A valid week, employee, day, and counted cash amount are required." }, { status: 400 });
  }

  const week = await prisma.financePayrollWeek.findUnique({
    where: { business_weekStart: { business: "mobile-grooming", weekStart } },
    select: {
      id: true,
      mobileGroomingEntries: {
        where: { serviceDate },
        select: { employeeName: true, paymentType: true, priceCents: true, upgradeCents: true, discountCents: true },
      },
    },
  });
  const entries = week?.mobileGroomingEntries.filter(
    (entry) => normalizeEmployeeName(entry.employeeName).toLocaleLowerCase() === employeeName.toLocaleLowerCase()
  ) ?? [];
  if (!week || entries.length === 0) {
    return NextResponse.json({ error: "No saved appointments exist for this employee and day." }, { status: 404 });
  }
  const canonicalName = normalizeEmployeeName(entries[0].employeeName);
  const expectedCashCents = entries.reduce(
    (sum, entry) => sum + (entry.paymentType === "cash" ? entry.priceCents + entry.upgradeCents - entry.discountCents : 0),
    0
  );
  const reconciledAt = new Date();
  const reconciliation = await prisma.financeMobileGroomingDailyReconciliation.upsert({
    where: {
      payrollWeekId_employeeName_serviceDate: {
        payrollWeekId: week.id,
        employeeName: canonicalName,
        serviceDate,
      },
    },
    create: { payrollWeekId: week.id, employeeName: canonicalName, serviceDate, expectedCashCents, countedCashCents, reconciledAt },
    update: { expectedCashCents, countedCashCents, reconciledAt },
  });
  return NextResponse.json({ reconciliation: serialize(reconciliation) });
}
