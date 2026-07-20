export const PAYROLL_CATEGORIES = ["TRAINING", "GROOMING", "RESORT"] as const;

export type PayrollCategoryValue = (typeof PAYROLL_CATEGORIES)[number];

export const PAYROLL_BUSINESSES = [
  { value: "pet-resort", label: "Planet Pooch Pet Resort" },
  { value: "mobile-grooming", label: "Planet Pooch Mobile Grooming" },
] as const;

export type PayrollBusinessValue = (typeof PAYROLL_BUSINESSES)[number]["value"];

export const DEFAULT_PAYROLL_BUSINESS: PayrollBusinessValue = "pet-resort";

const MS_PER_DAY = 86_400_000;

export type PayrollPayPeriod = {
  startDay: 0 | 6;
  rangeLabel: string;
  errorMessage: string;
};

export const PAYROLL_PAY_PERIODS: Record<PayrollBusinessValue, PayrollPayPeriod> = {
  "pet-resort": {
    startDay: 0,
    rangeLabel: "Sunday-Saturday",
    errorMessage: "Pet resort payroll weeks must run Sunday through Saturday",
  },
  "mobile-grooming": {
    startDay: 6,
    rangeLabel: "Saturday-Friday",
    errorMessage: "Mobile grooming payroll weeks must run Saturday through Friday",
  },
};

export const PAYROLL_CATEGORY_LABELS: Record<PayrollCategoryValue, string> = {
  TRAINING: "Training",
  GROOMING: "Grooming",
  RESORT: "Resort",
};

const CATEGORY_BY_EMPLOYEE: Record<string, PayrollCategoryValue> = {
  "rebecca cooperstein": "TRAINING",
  "gabriela sanchez": "GROOMING",
};

export function normalizeEmployeeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

export function isPayrollBusiness(value: unknown): value is PayrollBusinessValue {
  return PAYROLL_BUSINESSES.some((business) => business.value === value);
}

export function cleanPayrollBusiness(value: unknown): PayrollBusinessValue {
  return isPayrollBusiness(value) ? value : DEFAULT_PAYROLL_BUSINESS;
}

export function payrollPayPeriodForBusiness(business: PayrollBusinessValue): PayrollPayPeriod {
  return PAYROLL_PAY_PERIODS[business];
}

export function isValidPayrollWeekStart(
  weekStart: Date,
  business: PayrollBusinessValue
): boolean {
  return weekStart.getUTCDay() === payrollPayPeriodForBusiness(business).startDay;
}

export function isValidPayrollWeekRange(
  weekStart: Date,
  weekEnd: Date,
  business: PayrollBusinessValue
): boolean {
  const days = Math.round((weekEnd.getTime() - weekStart.getTime()) / MS_PER_DAY);
  return days === 6 && isValidPayrollWeekStart(weekStart, business);
}

export function lastCompletedPayrollWeekStart(
  business: PayrollBusinessValue,
  today = new Date()
): Date {
  const localTodayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const startDay = payrollPayPeriodForBusiness(business).startDay;
  const daysSinceStart = (localTodayUtc.getUTCDay() - startDay + 7) % 7;
  const currentStart = new Date(localTodayUtc);
  currentStart.setUTCDate(localTodayUtc.getUTCDate() - daysSinceStart);
  return new Date(currentStart.getTime() - 7 * MS_PER_DAY);
}

export function categoryForEmployee(
  name: string,
  business: PayrollBusinessValue = DEFAULT_PAYROLL_BUSINESS
): PayrollCategoryValue {
  if (business === "mobile-grooming") return "GROOMING";
  return CATEGORY_BY_EMPLOYEE[normalizeEmployeeName(name).toLocaleLowerCase()] ?? "RESORT";
}

export function formatPayrollDuration(totalSeconds: number): string {
  const sign = totalSeconds < 0 ? "-" : "";
  let remaining = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(remaining / 3600);
  remaining -= hours * 3600;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining - minutes * 60;
  return `${sign}${hours}h ${minutes}mins ${seconds}secs`;
}

export function decimalPayrollHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 100) / 100;
}

export type PayrollAutomationStatus = "manual" | "imported" | "needs_review";

export type MoegoClockInOutUpload = {
  business?: unknown;
  weekStart?: unknown;
  weekEnd?: unknown;
  dateRange?: unknown;
  rows?: unknown;
  totals?: unknown;
  rowCount?: unknown;
  pageSizeText?: unknown;
  warnings?: unknown;
  generatedAt?: unknown;
};

function isoDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value
    ? null
    : value;
}

function usDate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
  return date.getUTCFullYear() === Number(match[3]) &&
    date.getUTCMonth() === Number(match[1]) - 1 &&
    date.getUTCDate() === Number(match[2])
    ? date.toISOString().slice(0, 10)
    : null;
}

/** Validate browser-extracted MoeGo data before it enters the payroll table. */
export function validateMoegoClockInOutUpload(
  upload: MoegoClockInOutUpload,
  expectedWeekStart: string,
  expectedWeekEnd: string
): { status: PayrollAutomationStatus; reasons: string[]; sourceRowCount: number } {
  const reasons: string[] = [];
  const range = Array.isArray(upload.dateRange) ? upload.dateRange : [];
  const start = isoDate(upload.weekStart) ?? usDate(range[0]);
  const end = isoDate(upload.weekEnd) ?? usDate(range[1]);
  if (start !== expectedWeekStart || end !== expectedWeekEnd) {
    reasons.push(`Expected ${expectedWeekStart} through ${expectedWeekEnd}, received ${start ?? "no start"} through ${end ?? "no end"}.`);
  }

  const warnings = Array.isArray(upload.warnings)
    ? upload.warnings.map(String).filter(Boolean)
    : [];
  reasons.push(...warnings);
  if (upload.pageSizeText && !/^100\s*\/\s*page$/i.test(String(upload.pageSizeText))) {
    reasons.push(`Page size is ${String(upload.pageSizeText)}, not 100/page.`);
  }

  const rows = Array.isArray(upload.rows) ? upload.rows : [];
  const sourceRowCount = Number.isFinite(Number(upload.rowCount))
    ? Number(upload.rowCount)
    : rows.length;
  if (sourceRowCount !== rows.length) reasons.push("The extracted row count does not match the visible rows.");
  if (rows.length === 0) reasons.push("No clock-in/out rows were extracted.");

  for (const raw of rows) {
    const row = raw as Record<string, unknown>;
    const name = normalizeEmployeeName(String(row.name ?? row.employeeName ?? ""));
    const date = usDate(row.date) ?? isoDate(row.date);
    const time = String(row.time ?? "").trim().toLowerCase();
    if (!name) reasons.push("A clock-in/out row is missing an employee name.");
    if (!date || date < expectedWeekStart || date > expectedWeekEnd) {
      reasons.push(`A clock-in/out row has a date outside ${expectedWeekStart} through ${expectedWeekEnd}.`);
    }
    if (!time || /^(?:-|n\/a|na|incomplete|missing|—)$/.test(time)) {
      reasons.push(`Incomplete clock-in/out shift for ${name || "an employee"}.`);
    }
  }

  return {
    status: reasons.length > 0 ? "needs_review" : "imported",
    reasons: Array.from(new Set(reasons)),
    sourceRowCount,
  };
}

export function parsePayrollDurationToSeconds(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  const raw = String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!raw) return null;

  const colon = raw.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (colon) {
    const hours = Number(colon[1]);
    const minutes = Number(colon[2]);
    const seconds = Number(colon[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const h = raw.match(/(\d+(?:\.\d+)?)\s*h(?:ours?)?/);
  const m = raw.match(/(\d+)\s*m(?:in(?:ute)?s?)?/);
  const s = raw.match(/(\d+)\s*s(?:ec(?:ond)?s?)?/);
  if (!h && !m && !s) return null;

  return Math.max(
    0,
    Math.round(
      (h ? Number(h[1]) * 3600 : 0) +
        (m ? Number(m[1]) * 60 : 0) +
        (s ? Number(s[1]) : 0)
    )
  );
}
