import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import {
  PAYROLL_CATEGORIES,
  PAYROLL_CATEGORY_LABELS,
  categoryForEmployee,
  cleanPayrollBusiness,
  decimalPayrollHours,
  formatPayrollDuration,
  normalizeEmployeeName,
  parsePayrollDurationToSeconds,
  type PayrollBusinessValue,
  type PayrollCategoryValue,
} from "@/lib/payroll";

const MS_PER_DAY = 86_400_000;

type PayrollRowPayload = {
  employeeName?: unknown;
  name?: unknown;
  shifts?: unknown;
  totalSeconds?: unknown;
  totalDuration?: unknown;
  totalHours?: unknown;
  decimalHours?: unknown;
  hours?: unknown;
};

type MobileGroomingEntryPayload = {
  employeeName?: unknown;
  serviceDate?: unknown;
  paymentType?: unknown;
  dogs?: unknown;
  price?: unknown;
  priceCents?: unknown;
  upgradeQuantity?: unknown;
  upgradesQuantity?: unknown;
  upgradeAmount?: unknown;
  upgrade?: unknown;
  upgrades?: unknown;
  upgradeCents?: unknown;
  upgradesCents?: unknown;
  creditCardTip?: unknown;
  creditCardTipCents?: unknown;
  discount?: unknown;
  discountCents?: unknown;
};

type AnnualMobileGroomingTotals = {
  year: number;
  stops: number;
  dogs: number;
  pricingCents: number;
  cashCents: number;
  groomerPayCents: number;
  upgradeCents: number;
};

type WeeklyMobileGroomingTotals = Omit<AnnualMobileGroomingTotals, "year"> & {
  weekStart: string;
  weekEnd: string;
};

function unauthorized() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

async function canAccessPayroll() {
  const session = await getSession();
  return !!session?.user && isSuperAdmin((session.user as { role?: string }).role);
}

function parseDateParam(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function usDateToIso(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseWeekDates(payload: Record<string, unknown>) {
  let weekStartValue = payload.weekStart;
  let weekEndValue = payload.weekEnd;

  if ((!weekStartValue || !weekEndValue) && Array.isArray(payload.dateRange)) {
    weekStartValue = usDateToIso(payload.dateRange[0]);
    weekEndValue = usDateToIso(payload.dateRange[1]);
  }

  const weekStart = parseDateParam(weekStartValue);
  const weekEnd = parseDateParam(weekEndValue);
  if (!weekStart || !weekEnd) {
    return { error: "weekStart and weekEnd must be YYYY-MM-DD dates" as const };
  }

  const days = Math.round((weekEnd.getTime() - weekStart.getTime()) / MS_PER_DAY);
  if (weekStart.getUTCDay() !== 6 || days !== 6) {
    return { error: "Payroll weeks must run Saturday through Friday" as const };
  }

  return { weekStart, weekEnd };
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function mobileGroomingQuarterCycleStart(year: number): Date {
  const baseCycleStart = new Date(Date.UTC(2026, 0, 10));
  return addDays(baseCycleStart, (year - 2026) * 52 * 7);
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function totalSecondsFromRow(row: PayrollRowPayload): number | null {
  const totalSeconds = parsePayrollDurationToSeconds(row.totalSeconds);
  if (totalSeconds !== null) return totalSeconds;

  const totalDuration = parsePayrollDurationToSeconds(row.totalDuration);
  if (totalDuration !== null) return totalDuration;

  const totalHoursDuration = parsePayrollDurationToSeconds(row.totalHours);
  if (totalHoursDuration !== null) return totalHoursDuration;

  const decimalHours = asNumber(row.decimalHours ?? row.hours);
  if (decimalHours !== null) return Math.max(0, Math.round(decimalHours * 3600));

  return null;
}

function shiftsFromRow(row: PayrollRowPayload): number {
  const shifts = asNumber(row.shifts);
  if (shifts === null) return 0;
  return Math.max(0, Math.round(shifts));
}

function centsFromMoney(value: unknown): number {
  const amount = asNumber(value);
  if (amount === null) return 0;
  return Math.max(0, Math.round(amount * 100));
}

function centsFromPayload(centsValue: unknown, moneyValue: unknown): number {
  const cents = asNumber(centsValue);
  if (cents !== null) return Math.max(0, Math.round(cents));
  return centsFromMoney(moneyValue);
}

function normalizePaymentType(value: unknown) {
  const raw = String(value ?? "").trim().toLowerCase();
  return raw === "cash" ? "cash" : "credit";
}

function normalizeMobileGroomingEntries(rawEntries: unknown, weekStart: Date, weekEnd: Date) {
  if (!Array.isArray(rawEntries)) {
    return { error: "mobileEntries must be an array" as const };
  }

  const entries: Array<{
    employeeName: string;
    serviceDate: Date;
    paymentType: string;
    dogs: number;
    priceCents: number;
    upgradeQuantity: number;
    upgradeCents: number;
    creditCardTipCents: number;
    discountCents: number;
  }> = [];

  for (const raw of rawEntries) {
    const entry = raw as MobileGroomingEntryPayload;
    const employeeName = normalizeEmployeeName(String(entry.employeeName ?? ""));
    if (!employeeName) {
      return { error: "Each mobile grooming entry needs an employee" as const };
    }

    const serviceDate = parseDateParam(entry.serviceDate);
    if (!serviceDate) {
      return { error: `Service date is invalid for ${employeeName}` as const };
    }
    if (serviceDate < weekStart || serviceDate > weekEnd) {
      return { error: `Service date must fall inside the payroll week for ${employeeName}` as const };
    }

    entries.push({
      employeeName,
      serviceDate,
      paymentType: normalizePaymentType(entry.paymentType),
      dogs: Math.max(0, Math.round(asNumber(entry.dogs) ?? 0)),
      priceCents: centsFromPayload(entry.priceCents, entry.price),
      upgradeQuantity: Math.max(
        0,
        Math.round(asNumber(entry.upgradeQuantity ?? entry.upgradesQuantity) ?? 0)
      ),
      upgradeCents: centsFromPayload(
        entry.upgradeCents ?? entry.upgradesCents,
        entry.upgradeAmount ?? entry.upgrade ?? entry.upgrades
      ),
      creditCardTipCents: centsFromPayload(entry.creditCardTipCents, entry.creditCardTip),
      discountCents: centsFromPayload(entry.discountCents, entry.discount),
    });
  }

  return { entries };
}

function normalizeRows(rawRows: unknown, business: PayrollBusinessValue) {
  if (!Array.isArray(rawRows)) {
    return { error: "rows must be an array" as const };
  }

  const byName = new Map<
    string,
    { employeeName: string; shifts: number; totalSeconds: number; category: PayrollCategoryValue }
  >();

  for (const raw of rawRows) {
    const row = raw as PayrollRowPayload;
    const employeeName = normalizeEmployeeName(String(row.employeeName ?? row.name ?? ""));
    if (!employeeName) continue;

    const totalSeconds = totalSecondsFromRow(row);
    if (totalSeconds === null) {
      return { error: `Could not parse hours for ${employeeName}` as const };
    }

    const key = employeeName.toLocaleLowerCase();
    const current =
      byName.get(key) ??
      {
        employeeName,
        shifts: 0,
        totalSeconds: 0,
        category: categoryForEmployee(employeeName, business),
      };

    current.employeeName = current.employeeName || employeeName;
    current.shifts += shiftsFromRow(row);
    current.totalSeconds += totalSeconds;
    byName.set(key, current);
  }

  return {
    rows: Array.from(byName.values()).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" })
    ),
  };
}

function serializeWeek(
  week: {
    id: string;
    business: string;
    weekStart: Date;
    weekEnd: Date;
    createdAt: Date;
    updatedAt: Date;
    rows: Array<{
      id: string;
      employeeName: string;
      category: PayrollCategoryValue;
      shifts: number;
      totalSeconds: number;
      rowOrder: number;
    }>;
    mobileGroomingEntries: Array<{
      id: string;
      serviceDate: Date;
      employeeName: string;
      paymentType: string;
      dogs: number;
      priceCents: number;
      upgradeQuantity: number;
      upgradeCents: number;
      creditCardTipCents: number;
      discountCents: number;
      rowOrder: number;
    }>;
  } | null
) {
  if (!week) return null;

  const rows = week.rows.map((row) => ({
    id: row.id,
    employeeName: row.employeeName,
    category: row.category,
    categoryLabel: PAYROLL_CATEGORY_LABELS[row.category],
    shifts: row.shifts,
    totalSeconds: row.totalSeconds,
    totalDuration: formatPayrollDuration(row.totalSeconds),
    decimalHours: decimalPayrollHours(row.totalSeconds),
    rowOrder: row.rowOrder,
  }));

  const categoryTotals = PAYROLL_CATEGORIES.map((category) => {
    const categoryRows = rows.filter((row) => row.category === category);
    const totalSeconds = categoryRows.reduce((sum, row) => sum + row.totalSeconds, 0);
    return {
      category,
      label: PAYROLL_CATEGORY_LABELS[category],
      employeeCount: categoryRows.length,
      totalSeconds,
      totalDuration: formatPayrollDuration(totalSeconds),
      decimalHours: decimalPayrollHours(totalSeconds),
    };
  });

  const totalSeconds = rows.reduce((sum, row) => sum + row.totalSeconds, 0);
  const mobileGroomingEntries = week.mobileGroomingEntries.map((entry) => {
    const groomerPayCents = Math.round((entry.priceCents + entry.upgradeCents) * 0.4) +
      entry.creditCardTipCents;
    const totalPriceCents = entry.priceCents + entry.upgradeCents - entry.discountCents;
    return {
      id: entry.id,
      serviceDate: entry.serviceDate.toISOString().slice(0, 10),
      employeeName: entry.employeeName,
      paymentType: entry.paymentType,
      dogs: entry.dogs,
      priceCents: entry.priceCents,
      upgradeQuantity: entry.upgradeQuantity,
      upgradeCents: entry.upgradeCents,
      creditCardTipCents: entry.creditCardTipCents,
      discountCents: entry.discountCents,
      groomerPayCents,
      totalPriceCents,
      rowOrder: entry.rowOrder,
    };
  });

  return {
    id: week.id,
    business: week.business,
    weekStart: week.weekStart.toISOString().slice(0, 10),
    weekEnd: week.weekEnd.toISOString().slice(0, 10),
    createdAt: week.createdAt.toISOString(),
    updatedAt: week.updatedAt.toISOString(),
    rows,
    mobileGroomingEntries,
    categoryTotals,
    grandTotal: {
      employeeCount: rows.length,
      totalSeconds,
      totalDuration: formatPayrollDuration(totalSeconds),
      decimalHours: decimalPayrollHours(totalSeconds),
    },
  };
}

async function findWeekWithRows(business: PayrollBusinessValue, weekStart: Date | null) {
  if (!weekStart) return null;
  return prisma.financePayrollWeek.findUnique({
    where: { business_weekStart: { business, weekStart } },
    include: {
      rows: {
        orderBy: [{ rowOrder: "asc" }, { employeeName: "asc" }],
      },
      mobileGroomingEntries: {
        orderBy: [{ serviceDate: "asc" }, { rowOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
}

function emptyAnnualMobileGroomingTotals(year: number): AnnualMobileGroomingTotals {
  return {
    year,
    stops: 0,
    dogs: 0,
    pricingCents: 0,
    cashCents: 0,
    groomerPayCents: 0,
    upgradeCents: 0,
  };
}

async function loadAnnualMobileGroomingTotals(
  business: PayrollBusinessValue,
  selectedWeekStart: Date | null
): Promise<AnnualMobileGroomingTotals> {
  const year = (selectedWeekStart ?? new Date()).getUTCFullYear();
  const totals = emptyAnnualMobileGroomingTotals(year);
  if (business !== "mobile-grooming") return totals;

  const yearStart = new Date(Date.UTC(year, 0, 1));
  const nextYearStart = new Date(Date.UTC(year + 1, 0, 1));
  const entries = await prisma.financeMobileGroomingPayrollEntry.findMany({
    where: {
      serviceDate: {
        gte: yearStart,
        lt: nextYearStart,
      },
      payrollWeek: {
        business,
      },
    },
    select: {
      paymentType: true,
      dogs: true,
      priceCents: true,
      upgradeCents: true,
      creditCardTipCents: true,
      discountCents: true,
    },
  });

  for (const entry of entries) {
    const totalPriceCents = entry.priceCents + entry.upgradeCents - entry.discountCents;
    const groomerPayCents = Math.round((entry.priceCents + entry.upgradeCents) * 0.4) +
      entry.creditCardTipCents;
    totals.stops += 1;
    totals.dogs += entry.dogs;
    totals.pricingCents += totalPriceCents;
    totals.cashCents += entry.paymentType === "cash" ? totalPriceCents : 0;
    totals.groomerPayCents += groomerPayCents;
    totals.upgradeCents += entry.upgradeCents;
  }

  return totals;
}

async function loadWeeklyMobileGroomingTotals(
  business: PayrollBusinessValue,
  selectedWeekStart: Date | null
): Promise<WeeklyMobileGroomingTotals[]> {
  if (business !== "mobile-grooming") return [];

  const year = (selectedWeekStart ?? new Date()).getUTCFullYear();
  const cycleStart = mobileGroomingQuarterCycleStart(year);
  const cycleEnd = addDays(cycleStart, 52 * 7);
  const weeks = await prisma.financePayrollWeek.findMany({
    where: {
      business,
      weekStart: {
        gte: cycleStart,
        lt: cycleEnd,
      },
    },
    orderBy: { weekStart: "asc" },
    select: {
      weekStart: true,
      weekEnd: true,
      mobileGroomingEntries: {
        select: {
          paymentType: true,
          dogs: true,
          priceCents: true,
          upgradeCents: true,
          creditCardTipCents: true,
          discountCents: true,
        },
      },
    },
  });

  return weeks.map((week) => {
    const totals: WeeklyMobileGroomingTotals = {
      weekStart: week.weekStart.toISOString().slice(0, 10),
      weekEnd: week.weekEnd.toISOString().slice(0, 10),
      stops: 0,
      dogs: 0,
      pricingCents: 0,
      cashCents: 0,
      groomerPayCents: 0,
      upgradeCents: 0,
    };

    for (const entry of week.mobileGroomingEntries) {
      const totalPriceCents = entry.priceCents + entry.upgradeCents - entry.discountCents;
      const groomerPayCents = Math.round((entry.priceCents + entry.upgradeCents) * 0.4) +
        entry.creditCardTipCents;
      totals.stops += 1;
      totals.dogs += entry.dogs;
      totals.pricingCents += totalPriceCents;
      totals.cashCents += entry.paymentType === "cash" ? totalPriceCents : 0;
      totals.groomerPayCents += groomerPayCents;
      totals.upgradeCents += entry.upgradeCents;
    }

    return totals;
  });
}

export async function GET(req: NextRequest) {
  if (!(await canAccessPayroll())) return unauthorized();

  const business = cleanPayrollBusiness(req.nextUrl.searchParams.get("business"));
  const weeks = await prisma.financePayrollWeek.findMany({
    where: { business },
    orderBy: { weekStart: "desc" },
    take: 60,
    select: {
      id: true,
      business: true,
      weekStart: true,
      weekEnd: true,
      updatedAt: true,
    },
  });

  const requestedWeekStart = parseDateParam(req.nextUrl.searchParams.get("weekStart"));
  const selectedWeekStart = requestedWeekStart ?? weeks[0]?.weekStart ?? null;
  const week = await findWeekWithRows(business, selectedWeekStart);
  const annualTotals = await loadAnnualMobileGroomingTotals(business, selectedWeekStart);
  const weeklyTotals = await loadWeeklyMobileGroomingTotals(business, selectedWeekStart);

  return NextResponse.json({
    business,
    weeks: weeks.map((weekSummary) => ({
      id: weekSummary.id,
      business: weekSummary.business,
      weekStart: weekSummary.weekStart.toISOString().slice(0, 10),
      weekEnd: weekSummary.weekEnd.toISOString().slice(0, 10),
      updatedAt: weekSummary.updatedAt.toISOString(),
    })),
    week: serializeWeek(week),
    annualTotals,
    weeklyTotals,
  });
}

async function savePayroll(req: NextRequest) {
  if (!(await canAccessPayroll())) return unauthorized();

  const body = await req.json();
  const payload = (body?.payrollUpload ?? body) as Record<string, unknown>;
  const business = cleanPayrollBusiness(payload.business);
  const weekDates = parseWeekDates(payload);
  if ("error" in weekDates) {
    return NextResponse.json({ error: weekDates.error }, { status: 400 });
  }

  const rawRows =
    Array.isArray(payload.totals) && Array.isArray(payload.dateRange)
      ? payload.totals
      : payload.rows ?? payload.totals;
  const normalized =
    business === "mobile-grooming" ? { rows: [] } : normalizeRows(rawRows, business);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const normalizedMobileEntries =
    business === "mobile-grooming"
      ? normalizeMobileGroomingEntries(
          payload.mobileEntries ?? payload.entries,
          weekDates.weekStart,
          weekDates.weekEnd
        )
      : { entries: [] };
  if ("error" in normalizedMobileEntries) {
    return NextResponse.json({ error: normalizedMobileEntries.error }, { status: 400 });
  }

  const week = await prisma.$transaction(async (tx) => {
    const savedWeek = await tx.financePayrollWeek.upsert({
      where: { business_weekStart: { business, weekStart: weekDates.weekStart } },
      update: {
        weekEnd: weekDates.weekEnd,
      },
      create: {
        business,
        weekStart: weekDates.weekStart,
        weekEnd: weekDates.weekEnd,
      },
    });

    await tx.financePayrollEmployeeHours.deleteMany({
      where: { payrollWeekId: savedWeek.id },
    });
    await tx.financeMobileGroomingPayrollEntry.deleteMany({
      where: { payrollWeekId: savedWeek.id },
    });

    if (normalized.rows.length > 0) {
      await tx.financePayrollEmployeeHours.createMany({
        data: normalized.rows.map((row, index) => ({
          payrollWeekId: savedWeek.id,
          employeeName: row.employeeName,
          category: row.category,
          shifts: row.shifts,
          totalSeconds: row.totalSeconds,
          rowOrder: index,
        })),
      });
    }
    if (normalizedMobileEntries.entries.length > 0) {
      await tx.financeMobileGroomingPayrollEntry.createMany({
        data: normalizedMobileEntries.entries.map((entry, index) => ({
          payrollWeekId: savedWeek.id,
          serviceDate: entry.serviceDate,
          employeeName: entry.employeeName,
          paymentType: entry.paymentType,
          dogs: entry.dogs,
          priceCents: entry.priceCents,
          upgradeQuantity: entry.upgradeQuantity,
          upgradeCents: entry.upgradeCents,
          creditCardTipCents: entry.creditCardTipCents,
          discountCents: entry.discountCents,
          rowOrder: index,
        })),
      });
    }

    return tx.financePayrollWeek.findUnique({
      where: { id: savedWeek.id },
      include: {
        rows: {
          orderBy: [{ rowOrder: "asc" }, { employeeName: "asc" }],
        },
        mobileGroomingEntries: {
          orderBy: [{ serviceDate: "asc" }, { rowOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    });
  });

  const annualTotals = await loadAnnualMobileGroomingTotals(business, weekDates.weekStart);
  const weeklyTotals = await loadWeeklyMobileGroomingTotals(business, weekDates.weekStart);
  return NextResponse.json({ week: serializeWeek(week), annualTotals, weeklyTotals });
}

export async function PUT(req: NextRequest) {
  return savePayroll(req);
}

export async function POST(req: NextRequest) {
  return savePayroll(req);
}
