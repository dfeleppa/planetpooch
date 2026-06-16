import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import {
  PAYROLL_CATEGORIES,
  PAYROLL_CATEGORY_LABELS,
  categoryForEmployee,
  decimalPayrollHours,
  formatPayrollDuration,
  normalizeEmployeeName,
  parsePayrollDurationToSeconds,
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
  if (weekStart.getUTCDay() !== 0 || days !== 6) {
    return { error: "Payroll weeks must run Sunday through Saturday" as const };
  }

  return { weekStart, weekEnd };
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

function normalizeRows(rawRows: unknown) {
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
        category: categoryForEmployee(employeeName),
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
    weekStart: Date;
    weekEnd: Date;
    source: string;
    notes: string;
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

  return {
    id: week.id,
    weekStart: week.weekStart.toISOString().slice(0, 10),
    weekEnd: week.weekEnd.toISOString().slice(0, 10),
    source: week.source,
    notes: week.notes,
    createdAt: week.createdAt.toISOString(),
    updatedAt: week.updatedAt.toISOString(),
    rows,
    categoryTotals,
    grandTotal: {
      employeeCount: rows.length,
      totalSeconds,
      totalDuration: formatPayrollDuration(totalSeconds),
      decimalHours: decimalPayrollHours(totalSeconds),
    },
  };
}

async function findWeekWithRows(weekStart: Date | null) {
  if (!weekStart) return null;
  return prisma.financePayrollWeek.findUnique({
    where: { weekStart },
    include: {
      rows: {
        orderBy: [{ rowOrder: "asc" }, { employeeName: "asc" }],
      },
    },
  });
}

export async function GET(req: NextRequest) {
  if (!(await canAccessPayroll())) return unauthorized();

  const weeks = await prisma.financePayrollWeek.findMany({
    orderBy: { weekStart: "desc" },
    take: 60,
    select: {
      id: true,
      weekStart: true,
      weekEnd: true,
      source: true,
      updatedAt: true,
    },
  });

  const requestedWeekStart = parseDateParam(req.nextUrl.searchParams.get("weekStart"));
  const selectedWeekStart = requestedWeekStart ?? weeks[0]?.weekStart ?? null;
  const week = await findWeekWithRows(selectedWeekStart);

  return NextResponse.json({
    weeks: weeks.map((weekSummary) => ({
      id: weekSummary.id,
      weekStart: weekSummary.weekStart.toISOString().slice(0, 10),
      weekEnd: weekSummary.weekEnd.toISOString().slice(0, 10),
      source: weekSummary.source,
      updatedAt: weekSummary.updatedAt.toISOString(),
    })),
    week: serializeWeek(week),
  });
}

async function savePayroll(req: NextRequest) {
  if (!(await canAccessPayroll())) return unauthorized();

  const body = await req.json();
  const payload = (body?.payrollUpload ?? body) as Record<string, unknown>;
  const weekDates = parseWeekDates(payload);
  if ("error" in weekDates) {
    return NextResponse.json({ error: weekDates.error }, { status: 400 });
  }

  const rawRows =
    Array.isArray(payload.totals) && Array.isArray(payload.dateRange)
      ? payload.totals
      : payload.rows ?? payload.totals;
  const normalized = normalizeRows(rawRows);
  if ("error" in normalized) {
    return NextResponse.json({ error: normalized.error }, { status: 400 });
  }

  const source =
    typeof payload.source === "string" && payload.source.trim()
      ? payload.source.trim()
      : "manual";
  const notes = typeof payload.notes === "string" ? payload.notes.trim() : "";

  const week = await prisma.$transaction(async (tx) => {
    const savedWeek = await tx.financePayrollWeek.upsert({
      where: { weekStart: weekDates.weekStart },
      update: {
        weekEnd: weekDates.weekEnd,
        source,
        notes,
      },
      create: {
        weekStart: weekDates.weekStart,
        weekEnd: weekDates.weekEnd,
        source,
        notes,
      },
    });

    await tx.financePayrollEmployeeHours.deleteMany({
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

    return tx.financePayrollWeek.findUnique({
      where: { id: savedWeek.id },
      include: {
        rows: {
          orderBy: [{ rowOrder: "asc" }, { employeeName: "asc" }],
        },
      },
    });
  });

  return NextResponse.json({ week: serializeWeek(week) });
}

export async function PUT(req: NextRequest) {
  return savePayroll(req);
}

export async function POST(req: NextRequest) {
  return savePayroll(req);
}
