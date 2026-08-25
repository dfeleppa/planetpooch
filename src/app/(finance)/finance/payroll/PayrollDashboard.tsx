"use client";

import { ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  PAYROLL_CATEGORIES,
  PAYROLL_CATEGORY_LABELS,
  PAYROLL_BUSINESSES,
  DEFAULT_PAYROLL_BUSINESS,
  categoryForEmployee,
  decimalPayrollHours,
  isPayrollBusiness,
  isValidPayrollWeekRange,
  isValidPayrollWeekStart,
  lastCompletedPayrollWeekStart,
  normalizeEmployeeName,
  payrollPayPeriodForBusiness,
  parsePayrollDurationToSeconds,
  type PayrollBusinessValue,
  type PayrollCategoryValue,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";
import { PayrollSubnav } from "./PayrollSubnav";

const MS_PER_DAY = 86_400_000;
const MOEGO_CLOCK_INOUT_URL =
  "https://go.moego.pet/setting/staff/clockInout?%7Ec=9219&%7Eb=119538";

type SavedWeekSummary = {
  id: string;
  business: PayrollBusinessValue;
  weekStart: string;
  weekEnd: string;
  updatedAt: string;
};

type SavedPayrollRow = {
  id: string;
  employeeName: string;
  category: PayrollCategoryValue;
  shifts: number;
  totalSeconds: number;
  decimalHours: number;
};

type SavedMobileGroomingEntry = {
  id: string;
  serviceDate: string;
  employeeName: string;
  paymentType: "cash" | "credit";
  dogs: number;
  priceCents: number;
  upgradeQuantity: number;
  upgradeCents: number;
  creditCardTipCents: number;
  discountCents: number;
};

type MobileGroomingEntryRecord = Omit<SavedMobileGroomingEntry, "id"> & {
  id?: string;
};

type SavedPayrollWeek = {
  id: string;
  business: PayrollBusinessValue;
  weekStart: string;
  weekEnd: string;
  rows: SavedPayrollRow[];
  mobileGroomingEntries: SavedMobileGroomingEntry[];
  automationStatus?: "manual" | "imported" | "reviewed" | "needs_review";
  reviewReasons?: string[];
};

type AnnualMobileGroomingTotals = {
  year: number;
  stops: number;
  dogs: number;
  pricingCents: number;
  cashCents: number;
  creditCardTipCents: number;
  groomerPayCents: number;
  upgradeCents: number;
};

type WeeklyMobileGroomingTotals = Omit<AnnualMobileGroomingTotals, "year"> & {
  weekStart: string;
  weekEnd: string;
  override?: boolean;
};

type PayrollApiResponse = {
  business: PayrollBusinessValue;
  weeks: SavedWeekSummary[];
  week: SavedPayrollWeek | null;
  annualTotals?: AnnualMobileGroomingTotals;
  weeklyTotals?: WeeklyMobileGroomingTotals[];
};

type MobileGroomingPullResponse = {
  staff?: {
    id: string;
    name: string;
  };
  staffs?: Array<{
    id: string;
    name: string;
    entries: number;
  }>;
  entries?: MobileGroomingEntryRecord[];
  totals?: {
    appointments: number;
    pets: number;
    groomingPriceCents: number;
    totalPriceCents: number;
    cashCents: number;
    creditCardTipCents: number;
    upgradeCents: number;
  };
  statusCounts?: Record<string, number>;
  unmatchedEmployeeNames?: string[];
  error?: string;
};

type EditableRow = {
  localId: string;
  employeeName: string;
  shifts: string;
  decimalHours: string;
};

type EditableMobileGroomingEntry = {
  localId: string;
  serviceDate: string;
  employeeName: string;
  paymentType: "cash" | "credit";
  dogs: string;
  price: string;
  upgradeQuantity: string;
  upgradeAmount: string;
  creditCardTip: string;
  discount: string;
};

export type PayrollEmployeeOption = {
  id: string;
  name: string;
};

const EMPTY_EMPLOYEE_OPTIONS: PayrollEmployeeOption[] = [];

type MobileSummaryView = "annual" | "weekly";
type MobilePayrollView = "summary" | "employee";

type WeeklyTotalsEdit = {
  weekStart: string;
  weekEnd: string;
  stops: string;
  dogs: string;
  totalPricing: string;
  cashTotal: string;
  creditCardTips: string;
  upgrades: string;
};

type ImportRow = {
  employeeName?: unknown;
  name?: unknown;
  shifts?: unknown;
  totalSeconds?: unknown;
  totalDuration?: unknown;
  totalHours?: unknown;
  decimalHours?: unknown;
  hours?: unknown;
};

type PendingMoegoImport = {
  source: "moego-clock-inout";
  generatedAt?: string;
  dateRange?: unknown[];
  pageSizeText?: string;
  rowCount?: number;
  sourceRows?: unknown[];
  warnings: string[];
};

function makeLocalId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function dateFromParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysParam(value: string, days: number): string {
  return toDateParam(new Date(dateFromParam(value).getTime() + days * MS_PER_DAY));
}

function mobileGroomingQuarterCycleStart(year: number): string {
  const baseCycleStart = dateFromParam("2026-01-10");
  return toDateParam(new Date(baseCycleStart.getTime() + (year - 2026) * 52 * 7 * MS_PER_DAY));
}

function isPayrollWeekStart(value: string, business: PayrollBusinessValue): boolean {
  return isValidPayrollWeekStart(dateFromParam(value), business);
}

function lastCompletedWeekStart(business: PayrollBusinessValue) {
  return toDateParam(lastCompletedPayrollWeekStart(business));
}

function recentCompletedWeeks(business: PayrollBusinessValue, count = 26): string[] {
  const start = dateFromParam(lastCompletedWeekStart(business));
  return Array.from({ length: count }, (_, index) =>
    toDateParam(new Date(start.getTime() - index * 7 * MS_PER_DAY))
  );
}

function formatWeekRange(weekStart: string, weekEnd = addDaysParam(weekStart, 6)) {
  const start = dateFromParam(weekStart).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });
  const end = dateFromParam(weekEnd).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${start} - ${end}`;
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
  return toDateParam(date);
}

function decimalInputFromSeconds(totalSeconds: number): string {
  return decimalPayrollHours(totalSeconds).toFixed(2);
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}

function savedRowsToEditable(rows: SavedPayrollRow[]): EditableRow[] {
  return rows.map((row) => ({
    localId: row.id || makeLocalId(),
    employeeName: row.employeeName,
    shifts: String(row.shifts),
    decimalHours: decimalInputFromSeconds(row.totalSeconds),
  }));
}

function savedMobileEntriesToEditable(
  entries: MobileGroomingEntryRecord[] = []
): EditableMobileGroomingEntry[] {
  return entries.map((entry) => ({
    localId: entry.id || makeLocalId(),
    serviceDate: entry.serviceDate,
    employeeName: entry.employeeName,
    paymentType: entry.paymentType === "cash" ? "cash" : "credit",
    dogs: String(entry.dogs),
    price: centsToInput(entry.priceCents),
    upgradeQuantity: String(entry.upgradeQuantity),
    upgradeAmount: centsToInput(entry.upgradeCents),
    creditCardTip: centsToInput(entry.creditCardTipCents),
    discount: centsToInput(entry.discountCents),
  }));
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function secondsFromImportRow(row: ImportRow): number | null {
  const totalSeconds = parsePayrollDurationToSeconds(row.totalSeconds);
  if (totalSeconds !== null) return totalSeconds;

  const totalDuration = parsePayrollDurationToSeconds(row.totalDuration);
  if (totalDuration !== null) return totalDuration;

  if (typeof row.totalHours === "number" && Number.isFinite(row.totalHours)) {
    return Math.max(0, Math.round(row.totalHours * 3600));
  }

  const totalHours = parsePayrollDurationToSeconds(row.totalHours);
  if (totalHours !== null) return totalHours;

  const decimalHours = asNumber(row.decimalHours ?? row.hours);
  if (decimalHours !== null) return Math.max(0, Math.round(decimalHours * 3600));

  return null;
}

function importRowsToEditable(rawRows: unknown): EditableRow[] {
  if (!Array.isArray(rawRows)) {
    throw new Error("No payroll rows found.");
  }

  const byName = new Map<string, { employeeName: string; shifts: number; totalSeconds: number }>();
  for (const raw of rawRows) {
    const row = raw as ImportRow;
    const employeeName = normalizeEmployeeName(String(row.employeeName ?? row.name ?? ""));
    if (!employeeName) continue;

    const totalSeconds = secondsFromImportRow(row);
    if (totalSeconds === null) {
      throw new Error(`Could not parse hours for ${employeeName}.`);
    }

    const shifts = Math.max(0, Math.round(asNumber(row.shifts) ?? 0));
    const key = employeeName.toLocaleLowerCase();
    const current = byName.get(key) ?? { employeeName, shifts: 0, totalSeconds: 0 };
    current.shifts += shifts;
    current.totalSeconds += totalSeconds;
    byName.set(key, current);
  }

  return Array.from(byName.values())
    .sort((a, b) => a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" }))
    .map((row) => ({
      localId: makeLocalId(),
      employeeName: row.employeeName,
      shifts: String(row.shifts),
      decimalHours: decimalInputFromSeconds(row.totalSeconds),
    }));
}

function extractImportPayload(text: string) {
  const parsed = JSON.parse(text);
  const payload = parsed?.payrollUpload ?? parsed;
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.totals) && Array.isArray(payload.dateRange)
    ? payload.totals
    : payload.rows ?? payload.totals;
  const weekStart =
    typeof payload.weekStart === "string"
      ? payload.weekStart
      : Array.isArray(payload.dateRange)
      ? usDateToIso(payload.dateRange[0])
      : null;
  const weekEnd =
    typeof payload.weekEnd === "string"
      ? payload.weekEnd
      : Array.isArray(payload.dateRange)
      ? usDateToIso(payload.dateRange[1])
      : null;
  const explicitBusiness = isPayrollBusiness(payload.business) ? payload.business : null;
  const matchingBusinesses =
    weekStart && weekEnd
      ? PAYROLL_BUSINESSES.filter((option) =>
          isValidPayrollWeekRange(dateFromParam(weekStart), dateFromParam(weekEnd), option.value)
        ).map((option) => option.value)
      : [];
  const inferredBusiness = matchingBusinesses.length === 1 ? matchingBusinesses[0] : null;
  const warningValues = Array.isArray(payload.warnings)
    ? payload.warnings
    : Array.isArray(parsed?.warnings)
      ? parsed.warnings
      : [];
  const warnings = warningValues.map(String).filter(Boolean);
  const source = payload.source === "moego-clock-inout" ? "moego-clock-inout" : null;
  const sourceRows = Array.isArray(payload.sourceRows)
    ? payload.sourceRows
    : Array.isArray(parsed?.rows)
      ? parsed.rows
      : undefined;
  const pageSizeText =
    typeof payload.pageSizeText === "string"
      ? payload.pageSizeText
      : typeof parsed?.pageSizeText === "string"
        ? parsed.pageSizeText
        : undefined;
  if (source && !sourceRows) {
    warnings.push("Source shift details are missing; verify incomplete shifts in MoeGo.");
  }
  if (source && !pageSizeText) {
    warnings.push("Could not verify the page-size control is 100/page.");
  }

  return {
    rows: importRowsToEditable(rows),
    business: explicitBusiness ?? inferredBusiness,
    weekStart,
    weekEnd,
    moegoImport: source
      ? {
          source,
          generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : undefined,
          dateRange: Array.isArray(payload.dateRange)
            ? payload.dateRange
            : Array.isArray(parsed?.dateRange)
              ? parsed.dateRange
              : undefined,
          pageSizeText,
          rowCount: asNumber(payload.rowCount ?? parsed?.rowCount) ?? undefined,
          sourceRows,
          warnings,
        } satisfies PendingMoegoImport
      : null,
  };
}

function categoryBadgeVariant(category: PayrollCategoryValue) {
  if (category === "TRAINING") return "info";
  if (category === "GROOMING") return "success";
  return "default";
}

function rowDecimalHours(row: EditableRow): number {
  const parsed = Number(row.decimalHours);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function moneyValue(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function mobileEntryDogCount(entry: EditableMobileGroomingEntry): number {
  return Math.max(0, Math.round(Number(entry.dogs) || 0));
}

function mobileEntryGroomerPay(entry: EditableMobileGroomingEntry): number {
  const commissionBase = Math.max(
    0,
    moneyValue(entry.price) + moneyValue(entry.upgradeAmount) - mobileEntryDogCount(entry) * 5
  );
  return commissionBase * 0.4 + moneyValue(entry.creditCardTip);
}

function mobileEntryGroomingPrice(entry: EditableMobileGroomingEntry): number {
  return moneyValue(entry.price);
}

function mobileEntryTotalPrice(entry: EditableMobileGroomingEntry): number {
  return moneyValue(entry.price) + moneyValue(entry.upgradeAmount) - moneyValue(entry.discount);
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function rowShifts(row: EditableRow): number {
  const parsed = Number(row.shifts);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function secondsFromEditable(row: EditableRow): number {
  return Math.round(rowDecimalHours(row) * 3600);
}

function emptyMobileGroomingTotals(): Omit<AnnualMobileGroomingTotals, "year"> {
  return {
    stops: 0,
    dogs: 0,
    pricingCents: 0,
    cashCents: 0,
    creditCardTipCents: 0,
    groomerPayCents: 0,
    upgradeCents: 0,
  };
}

function weeklyTotalsEditFromRow(week: WeeklyMobileGroomingTotals): WeeklyTotalsEdit {
  return {
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    stops: String(week.stops),
    dogs: String(week.dogs),
    totalPricing: centsToInput(week.pricingCents),
    cashTotal: centsToInput(week.cashCents),
    creditCardTips: centsToInput(week.creditCardTipCents),
    upgrades: centsToInput(week.upgradeCents),
  };
}

function weeklyTotalsEditGroomerPay(edit: WeeklyTotalsEdit): number {
  const dogs = Math.max(0, Math.round(Number(edit.dogs) || 0));
  const commissionBase = Math.max(0, moneyValue(edit.totalPricing) - dogs * 5);
  return commissionBase * 0.4 + moneyValue(edit.creditCardTips);
}

function weeklyTotalsEditGroomingPrice(edit: WeeklyTotalsEdit): number {
  return Math.max(0, moneyValue(edit.totalPricing) - moneyValue(edit.upgrades));
}

function mobileGroomingPriceFromTotals(total: {
  pricingCents: number;
  upgradeCents: number;
}) {
  return Math.max(0, total.pricingCents - total.upgradeCents);
}

export function PayrollDashboard({
  employeeOptionsByBusiness = {},
  initialBusiness = DEFAULT_PAYROLL_BUSINESS,
}: {
  employeeOptionsByBusiness?: Partial<Record<PayrollBusinessValue, PayrollEmployeeOption[]>>;
  initialBusiness?: PayrollBusinessValue;
}) {
  const [savedWeeks, setSavedWeeks] = useState<SavedWeekSummary[]>([]);
  const [business, setBusiness] = useState<PayrollBusinessValue>(initialBusiness);
  const [weekStart, setWeekStart] = useState(() => lastCompletedWeekStart(initialBusiness));
  const [automationStatus, setAutomationStatus] = useState<SavedPayrollWeek["automationStatus"]>("manual");
  const [reviewReasons, setReviewReasons] = useState<string[]>([]);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [mobileEntries, setMobileEntries] = useState<EditableMobileGroomingEntry[]>([]);
  const [annualMobileTotals, setAnnualMobileTotals] =
    useState<AnnualMobileGroomingTotals | null>(null);
  const [storedWeeklyMobileTotals, setStoredWeeklyMobileTotals] = useState<
    WeeklyMobileGroomingTotals[]
  >([]);
  const [mobileSummaryView, setMobileSummaryView] = useState<MobileSummaryView>("annual");
  const [mobilePayrollView, setMobilePayrollView] = useState<MobilePayrollView>("employee");
  const [openMobileQuarters, setOpenMobileQuarters] = useState<Record<string, boolean>>({});
  const [weeklyTotalsEdit, setWeeklyTotalsEdit] = useState<WeeklyTotalsEdit | null>(null);
  const [savingWeeklyTotals, setSavingWeeklyTotals] = useState(false);
  const [selectedMobileEmployee, setSelectedMobileEmployee] = useState("");
  const [mobileStopsOpen, setMobileStopsOpen] = useState(true);
  const [pullingMoego, setPullingMoego] = useState(false);
  const [importText, setImportText] = useState("");
  const [showMoegoImport, setShowMoegoImport] = useState(false);
  const [pendingMoegoImport, setPendingMoegoImport] = useState<PendingMoegoImport | null>(null);
  const [reviewAcknowledged, setReviewAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unresolvedImportWarnings = Boolean(
    pendingMoegoImport?.warnings.length && !reviewAcknowledged
  );

  const weekEnd = addDaysParam(weekStart, 6);
  const isMobileGrooming = business === "mobile-grooming";
  const payPeriod = payrollPayPeriodForBusiness(business);
  const employeeOptions = employeeOptionsByBusiness[business] ?? EMPTY_EMPLOYEE_OPTIONS;
  const mobileEmployeeChoicesUnavailable = isMobileGrooming && employeeOptions.length === 0;
  const mobileEmployeePlaceholder =
    employeeOptions.length === 0 ? "No employees available" : "Select employee";
  const mobileViewEmployeeName =
    mobilePayrollView === "employee" ? normalizeEmployeeName(selectedMobileEmployee) : "";
  const mobileViewEmployeeKey = mobileViewEmployeeName.toLocaleLowerCase();
  const weekDays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) => {
        const value = addDaysParam(weekStart, index);
        const date = dateFromParam(value);
        return {
          value,
          label: date.toLocaleDateString("en-US", {
            timeZone: "UTC",
            weekday: "long",
            month: "short",
            day: "numeric",
          }),
        };
      }),
    [weekStart]
  );

  const weekOptions = useMemo(() => {
    const byStart = new Map<string, { weekStart: string; weekEnd: string; stored: boolean }>();
    for (const week of savedWeeks) {
      if (!isPayrollWeekStart(week.weekStart, business)) continue;
      byStart.set(week.weekStart, {
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        stored: true,
      });
    }
    for (const start of recentCompletedWeeks(business)) {
      if (!byStart.has(start)) {
        byStart.set(start, {
          weekStart: start,
          weekEnd: addDaysParam(start, 6),
          stored: false,
        });
      }
    }
    if (!byStart.has(weekStart)) {
      byStart.set(weekStart, {
        weekStart,
        weekEnd,
        stored: savedWeeks.some((week) => week.weekStart === weekStart),
      });
    }
    return Array.from(byStart.values()).sort((a, b) => b.weekStart.localeCompare(a.weekStart));
  }, [business, savedWeeks, weekEnd, weekStart]);

  const totals = useMemo(() => {
    const categoryTotals = PAYROLL_CATEGORIES.map((category) => {
      const categoryRows = rows.filter(
        (row) =>
          normalizeEmployeeName(row.employeeName) &&
          categoryForEmployee(row.employeeName, business) === category
      );
      const totalSeconds = categoryRows.reduce((sum, row) => sum + secondsFromEditable(row), 0);
      return {
        category,
        label: PAYROLL_CATEGORY_LABELS[category],
        employeeCount: categoryRows.length,
        totalSeconds,
        decimalHours: decimalPayrollHours(totalSeconds),
      };
    });
    const grandSeconds = categoryTotals.reduce((sum, total) => sum + total.totalSeconds, 0);
    return {
      categoryTotals,
      grandSeconds,
      employeeCount: rows.filter((row) => normalizeEmployeeName(row.employeeName)).length,
    };
  }, [business, rows]);

  const visibleMobileEntries = useMemo(() => {
    if (mobilePayrollView === "employee" && !mobileViewEmployeeKey) return [];
    if (!mobileViewEmployeeKey) return mobileEntries;
    return mobileEntries.filter(
      (entry) =>
        normalizeEmployeeName(entry.employeeName).toLocaleLowerCase() ===
        mobileViewEmployeeKey
    );
  }, [mobileEntries, mobilePayrollView, mobileViewEmployeeKey]);

  const selectedWeekMobileTotals = useMemo(() => {
    return visibleMobileEntries.reduce(
      (total, entry) => {
        const totalPrice = mobileEntryTotalPrice(entry);
        total.stops += 1;
        total.dogs += mobileEntryDogCount(entry);
        total.groomingPrice += mobileEntryGroomingPrice(entry);
        total.pricing += totalPrice;
        total.cash += entry.paymentType === "cash" ? totalPrice : 0;
        total.creditCardTips += moneyValue(entry.creditCardTip);
        total.groomerPay += mobileEntryGroomerPay(entry);
        total.upgrades += moneyValue(entry.upgradeAmount);
        return total;
      },
      {
        stops: 0,
        dogs: 0,
        groomingPrice: 0,
        pricing: 0,
        cash: 0,
        creditCardTips: 0,
        groomerPay: 0,
        upgrades: 0,
      }
    );
  }, [visibleMobileEntries]);

  const annualYear = annualMobileTotals?.year ?? dateFromParam(weekStart).getUTCFullYear();
  const mobileQuarterGroups = useMemo(() => {
    const storedByWeek = new Map(storedWeeklyMobileTotals.map((week) => [week.weekStart, week]));
    const cycleStart = mobileGroomingQuarterCycleStart(annualYear);

    return Array.from({ length: 4 }, (_, quarterIndex) => {
      const quarterStart = addDaysParam(cycleStart, quarterIndex * 13 * 7);
      const quarterEnd = addDaysParam(quarterStart, 13 * 7 - 1);
      const weeks = Array.from({ length: 13 }, (_, weekIndex) => {
        const rowWeekStart = addDaysParam(quarterStart, weekIndex * 7);
        const rowWeekEnd = addDaysParam(rowWeekStart, 6);
        const stored = storedByWeek.get(rowWeekStart);
        return {
          weekStart: rowWeekStart,
          weekEnd: stored?.weekEnd ?? rowWeekEnd,
          stops: stored?.stops ?? 0,
          dogs: stored?.dogs ?? 0,
          pricingCents: stored?.pricingCents ?? 0,
          cashCents: stored?.cashCents ?? 0,
          creditCardTipCents: stored?.creditCardTipCents ?? 0,
          groomerPayCents: stored?.groomerPayCents ?? 0,
          upgradeCents: stored?.upgradeCents ?? 0,
          override: Boolean(stored?.override),
          stored: Boolean(stored),
        };
      });
      const totals = weeks.reduce((sum, week) => {
        sum.stops += week.stops;
        sum.dogs += week.dogs;
        sum.pricingCents += week.pricingCents;
        sum.cashCents += week.cashCents;
        sum.creditCardTipCents += week.creditCardTipCents;
        sum.groomerPayCents += week.groomerPayCents;
        sum.upgradeCents += week.upgradeCents;
        return sum;
      }, emptyMobileGroomingTotals());

      return {
        id: quarterStart,
        label: `Quarter ${quarterIndex + 1}`,
        range: formatWeekRange(quarterStart, quarterEnd),
        totals,
        weeks,
      };
    });
  }, [annualYear, storedWeeklyMobileTotals]);
  const mobileAppointmentsTitle =
    mobilePayrollView === "summary"
      ? "All mobile grooming appointments"
      : "Mobile grooming appointments";
  const showMobileAppointmentMetrics =
    mobilePayrollView === "summary" || Boolean(mobileViewEmployeeName);
  const showMobileAppointmentDetails =
    mobilePayrollView === "employee" && Boolean(mobileViewEmployeeName);
  const idlePullMoegoLabel =
    mobilePayrollView === "summary" ? "Pull all from MoeGo" : "Pull from MoeGo";
  const pullMoegoLabel = pullingMoego ? "Pulling..." : idlePullMoegoLabel;

  const loadWeek = useCallback(async (
    selectedWeekStart: string | undefined,
    selectedBusiness: PayrollBusinessValue,
    selectedEmployeeName = ""
  ) => {
    setBusiness(selectedBusiness);
    setLoading(true);
    setError(null);
    setPendingMoegoImport(null);
    setReviewAcknowledged(false);
    try {
      const params = new URLSearchParams({ business: selectedBusiness });
      if (selectedWeekStart) params.set("weekStart", selectedWeekStart);
      const employeeName = normalizeEmployeeName(selectedEmployeeName);
      if (selectedBusiness === "mobile-grooming" && employeeName) {
        params.set("employeeName", employeeName);
      }
      const url = `/api/finance/payroll?${params.toString()}`;
      const response = await fetch(url);
      const data = (await response.json()) as PayrollApiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load payroll.");

      setSavedWeeks(data.weeks);
      setAnnualMobileTotals(data.annualTotals ?? null);
      setStoredWeeklyMobileTotals(data.weeklyTotals ?? []);
      setBusiness(data.week?.business ?? data.business ?? selectedBusiness);
      if (data.week) {
        setWeekStart(data.week.weekStart);
        setAutomationStatus(data.week.automationStatus ?? "manual");
        setReviewReasons(data.week.reviewReasons ?? []);
        setRows(savedRowsToEditable(data.week.rows));
        setMobileEntries(savedMobileEntriesToEditable(data.week.mobileGroomingEntries));
      } else {
        const nextWeekStart = selectedWeekStart ?? lastCompletedWeekStart(selectedBusiness);
        setWeekStart(nextWeekStart);
        setAutomationStatus("manual");
        setReviewReasons([]);
        setRows([]);
        setMobileEntries([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payroll.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMobileSummary = useCallback(async (
    selectedWeekStart: string,
    selectedEmployeeName: string
  ) => {
    setError(null);
    try {
      const params = new URLSearchParams({
        business: "mobile-grooming",
        weekStart: selectedWeekStart,
      });
      const employeeName = normalizeEmployeeName(selectedEmployeeName);
      if (employeeName) params.set("employeeName", employeeName);
      const response = await fetch(`/api/finance/payroll?${params.toString()}`);
      const data = (await response.json()) as PayrollApiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load payroll totals.");

      setAnnualMobileTotals(data.annualTotals ?? null);
      setStoredWeeklyMobileTotals(data.weeklyTotals ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payroll totals.");
    }
  }, []);

  useEffect(() => {
    void loadWeek(lastCompletedWeekStart(initialBusiness), initialBusiness);
  }, [initialBusiness, loadWeek]);

  function updateRow(localId: string, patch: Partial<EditableRow>) {
    setRows((current) =>
      current.map((row) => (row.localId === localId ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setRows((current) => [
      ...current,
      {
        localId: makeLocalId(),
        employeeName: "",
        shifts: "0",
        decimalHours: "0",
      },
    ]);
  }

  function selectMobilePayrollView(view: MobilePayrollView) {
    setMobilePayrollView(view);
    setWeeklyTotalsEdit(null);
    if (isMobileGrooming) {
      void loadMobileSummary(weekStart, view === "employee" ? selectedMobileEmployee : "");
    }
  }

  function addMobileEmployee(employeeName: string) {
    const normalizedEmployeeName = normalizeEmployeeName(employeeName);
    setMobilePayrollView("employee");
    setWeeklyTotalsEdit(null);
    setSelectedMobileEmployee(normalizedEmployeeName);
    if (isMobileGrooming) {
      void loadMobileSummary(weekStart, normalizedEmployeeName);
    }
  }

  function removeRow(localId: string) {
    setRows((current) => current.filter((row) => row.localId !== localId));
  }

  function addMobileEntry(serviceDate: string) {
    const employeeName = normalizeEmployeeName(selectedMobileEmployee);
    if (!employeeName) {
      setError("Select an employee before adding an appointment.");
      return;
    }
    setError(null);
    setMobileEntries((current) => [
      ...current,
      {
        localId: makeLocalId(),
        serviceDate,
        employeeName,
        paymentType: "credit",
        dogs: "1",
        price: "0",
        upgradeQuantity: "0",
        upgradeAmount: "0",
        creditCardTip: "0",
        discount: "0",
      },
    ]);
  }

  function updateMobileEntry(
    localId: string,
    patch: Partial<EditableMobileGroomingEntry>
  ) {
    setMobileEntries((current) =>
      current.map((entry) => (entry.localId === localId ? { ...entry, ...patch } : entry))
    );
  }

  function removeMobileEntry(localId: string) {
    setMobileEntries((current) => current.filter((entry) => entry.localId !== localId));
  }

  async function pullMobileGroomingFromMoego() {
    const employeeName =
      mobilePayrollView === "employee" ? normalizeEmployeeName(selectedMobileEmployee) : "";
    if (mobilePayrollView === "employee" && !employeeName) {
      setError("Select an employee before pulling from MoeGo.");
      return;
    }
    const employeeNames =
      mobilePayrollView === "summary"
        ? employeeOptions.map((employee) => normalizeEmployeeName(employee.name)).filter(Boolean)
        : [];

    setPullingMoego(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/moego", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(employeeName ? { employeeName } : {}),
          ...(employeeNames.length > 0 ? { employeeNames } : {}),
          weekStart,
          weekEnd,
        }),
      });
      const data = (await response.json()) as MobileGroomingPullResponse;
      if (!response.ok || !data.entries) {
        throw new Error(data.error || "Could not pull MoeGo payroll data.");
      }

      const importedEntries = savedMobileEntriesToEditable(data.entries);
      const pulledEmployeeKeys = new Set(
        (
          mobilePayrollView === "summary"
            ? data.staffs?.map((staff) => staff.name) ??
              importedEntries.map((entry) => entry.employeeName)
            : [employeeName]
        )
          .map((name) => normalizeEmployeeName(name).toLocaleLowerCase())
          .filter(Boolean)
      );
      setMobileEntries((current) =>
        [
          ...current.filter(
            (entry) =>
              !pulledEmployeeKeys.has(normalizeEmployeeName(entry.employeeName).toLocaleLowerCase())
          ),
          ...importedEntries,
        ].sort((a, b) => {
          const dateCompare = a.serviceDate.localeCompare(b.serviceDate);
          if (dateCompare !== 0) return dateCompare;
          return a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" });
        })
      );

      const totals = data.totals;
      const skipped = data.statusCounts
        ? Object.entries(data.statusCounts)
            .filter(([status]) => status !== "FINISHED")
            .map(([status, count]) => `${count} ${status.toLowerCase()}`)
            .join(", ")
        : "";
      const unmatched = data.unmatchedEmployeeNames?.length
        ? ` Could not match ${data.unmatchedEmployeeNames.join(", ")}.`
        : "";
      const staffLabel =
        mobilePayrollView === "summary"
          ? `across ${data.staffs?.length ?? pulledEmployeeKeys.size} employees`
          : `for ${data.staff?.name ?? employeeName}`;
      setMessage(
        `Pulled ${totals?.appointments ?? importedEntries.length} appointments and ${
          totals?.pets ?? importedEntries.reduce((sum, entry) => sum + mobileEntryDogCount(entry), 0)
        } pets ${staffLabel}.${skipped ? ` Excluded ${skipped}.` : ""}${unmatched}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not pull MoeGo payroll data.");
    } finally {
      setPullingMoego(false);
    }
  }

  function applyImportText(text: string) {
    setError(null);
    setMessage(null);
    try {
      const imported = extractImportPayload(text);
      if (!imported.weekStart || !imported.weekEnd) {
        throw new Error("The import must include a Sunday-Saturday weekStart and weekEnd.");
      }
      if (imported.business !== "pet-resort") {
        throw new Error("This MoeGo import must be for a Pet Resort Sunday-Saturday week.");
      }
      if (imported.business) setBusiness(imported.business);
      if (imported.weekStart) setWeekStart(imported.weekStart);
      setRows(imported.rows);
      setMobileEntries([]);
      setPendingMoegoImport(imported.moegoImport);
      setReviewAcknowledged(false);
      setShowMoegoImport(true);
      setMessage(
        imported.moegoImport?.warnings.length
          ? `Loaded ${imported.rows.length} employee rows with ${imported.moegoImport.warnings.length} item(s) requiring review.`
          : `Loaded ${imported.rows.length} employee rows for review.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import payroll data.");
    }
  }

  function openMoegoClockInOut() {
    window.open(MOEGO_CLOCK_INOUT_URL, "_blank", "noopener,noreferrer");
    setShowMoegoImport(true);
  }

  async function pasteImportFromClipboard() {
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error("The clipboard is empty.");
      setImportText(text);
      applyImportText(text);
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not read payroll JSON from the clipboard: ${err.message}`
          : "Could not read payroll JSON from the clipboard."
      );
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setImportText(text);
    applyImportText(text);
    event.target.value = "";
  }

  async function savePayroll() {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      if (isMobileGrooming) {
        const cleanEntries = mobileEntries.map((entry) => ({
          serviceDate: entry.serviceDate,
          employeeName: normalizeEmployeeName(entry.employeeName),
          paymentType: entry.paymentType,
          dogs: mobileEntryDogCount(entry),
          price: moneyValue(entry.price),
          upgradeQuantity: Math.max(0, Math.round(Number(entry.upgradeQuantity) || 0)),
          upgradesCents: Math.round(moneyValue(entry.upgradeAmount) * 100),
          creditCardTip: moneyValue(entry.creditCardTip),
          discount: moneyValue(entry.discount),
        })).filter((entry) => entry.employeeName);

        if (cleanEntries.length === 0) {
          throw new Error("Add at least one mobile grooming appointment.");
        }

        const response = await fetch("/api/finance/payroll", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            weekStart,
            weekEnd,
            business,
            mobileEntries: cleanEntries,
          }),
        });
        const data = (await response.json()) as {
          week?: SavedPayrollWeek;
          annualTotals?: AnnualMobileGroomingTotals;
          weeklyTotals?: WeeklyMobileGroomingTotals[];
          error?: string;
        };
        if (!response.ok || !data.week) throw new Error(data.error || "Could not save payroll.");

        setWeekStart(data.week.weekStart);
        setAutomationStatus(data.week.automationStatus ?? "manual");
        setReviewReasons(data.week.reviewReasons ?? []);
        setBusiness(data.week.business);
        setRows(savedRowsToEditable(data.week.rows));
        setMobileEntries(savedMobileEntriesToEditable(data.week.mobileGroomingEntries));
        if (mobileViewEmployeeKey) {
          await loadMobileSummary(data.week.weekStart, mobileViewEmployeeName);
        } else {
          setAnnualMobileTotals(data.annualTotals ?? null);
          setStoredWeeklyMobileTotals(data.weeklyTotals ?? []);
        }
        setSavedWeeks((current) => {
          const summary = {
            id: data.week!.id,
            business: data.week!.business,
            weekStart: data.week!.weekStart,
            weekEnd: data.week!.weekEnd,
            updatedAt: new Date().toISOString(),
          };
          return [
            summary,
            ...current.filter(
              (week) => week.business !== summary.business || week.weekStart !== summary.weekStart
            ),
          ].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
        });
        setMessage("Payroll saved.");
        return;
      }

      const cleanRows = rows
        .map((row) => ({
          employeeName: normalizeEmployeeName(row.employeeName),
          shifts: rowShifts(row),
          decimalHours: rowDecimalHours(row),
        }))
        .filter((row) => row.employeeName);

      if (cleanRows.length === 0) {
        throw new Error("Add at least one employee row.");
      }

      const invalid = cleanRows.find((row) => !Number.isFinite(row.decimalHours));
      if (invalid) {
        throw new Error(`Total hours must be a number for ${invalid.employeeName}.`);
      }
      if (unresolvedImportWarnings) {
        throw new Error("Review and acknowledge the MoeGo warnings before saving payroll.");
      }

      const response = await fetch("/api/finance/payroll", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          weekEnd,
          business,
          rows: cleanRows,
          ...(pendingMoegoImport
            ? {
                ...pendingMoegoImport,
                reviewAcknowledged,
              }
            : {}),
        }),
      });
      const data = (await response.json()) as { week?: SavedPayrollWeek; error?: string };
      if (!response.ok || !data.week) throw new Error(data.error || "Could not save payroll.");

      setWeekStart(data.week.weekStart);
      setAutomationStatus(data.week.automationStatus ?? "manual");
      setReviewReasons(data.week.reviewReasons ?? []);
      setBusiness(data.week.business);
      setRows(savedRowsToEditable(data.week.rows));
      setPendingMoegoImport(null);
      setReviewAcknowledged(false);
      setImportText("");
      setShowMoegoImport(false);
      setSavedWeeks((current) => {
        const summary = {
          id: data.week!.id,
          business: data.week!.business,
          weekStart: data.week!.weekStart,
          weekEnd: data.week!.weekEnd,
          updatedAt: new Date().toISOString(),
        };
        return [
          summary,
          ...current.filter(
            (week) => week.business !== summary.business || week.weekStart !== summary.weekStart
          ),
        ].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      });
      setMessage("Payroll saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save payroll.");
    } finally {
      setSaving(false);
    }
  }

  function startWeeklyTotalsEdit(week: WeeklyMobileGroomingTotals) {
    setError(null);
    setMessage(null);
    setWeeklyTotalsEdit(weeklyTotalsEditFromRow(week));
  }

  function updateWeeklyTotalsEdit(patch: Partial<WeeklyTotalsEdit>) {
    setWeeklyTotalsEdit((current) => (current ? { ...current, ...patch } : current));
  }

  async function saveWeeklyTotalsEdit() {
    if (!weeklyTotalsEdit) return;
    setSavingWeeklyTotals(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/finance/payroll", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart: weeklyTotalsEdit.weekStart,
          weekEnd: weeklyTotalsEdit.weekEnd,
          business: "mobile-grooming",
          weeklyTotals: {
            stops: Math.max(0, Math.round(Number(weeklyTotalsEdit.stops) || 0)),
            dogs: Math.max(0, Math.round(Number(weeklyTotalsEdit.dogs) || 0)),
            totalPricing: moneyValue(weeklyTotalsEdit.totalPricing),
            cashTotal: moneyValue(weeklyTotalsEdit.cashTotal),
            creditCardTips: moneyValue(weeklyTotalsEdit.creditCardTips),
            upgrades: moneyValue(weeklyTotalsEdit.upgrades),
          },
        }),
      });
      const data = (await response.json()) as {
        week?: SavedPayrollWeek;
        annualTotals?: AnnualMobileGroomingTotals;
        weeklyTotals?: WeeklyMobileGroomingTotals[];
        error?: string;
      };
      if (!response.ok || !data.week) {
        throw new Error(data.error || "Could not save weekly totals.");
      }

      setAnnualMobileTotals(data.annualTotals ?? null);
      setStoredWeeklyMobileTotals(data.weeklyTotals ?? []);
      setSavedWeeks((current) => {
        const summary = {
          id: data.week!.id,
          business: data.week!.business,
          weekStart: data.week!.weekStart,
          weekEnd: data.week!.weekEnd,
          updatedAt: new Date().toISOString(),
        };
        return [
          summary,
          ...current.filter(
            (week) => week.business !== summary.business || week.weekStart !== summary.weekStart
          ),
        ].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      });
      setWeeklyTotalsEdit(null);
      setMessage("Weekly totals saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save weekly totals.");
    } finally {
      setSavingWeeklyTotals(false);
    }
  }

  return (
    <div className={cn("space-y-5", loading && "opacity-70")}>
      <PayrollSubnav active={business} />

      {isMobileGrooming && (
        <div>
          <p className="mb-1 text-sm font-medium text-gray-700">View</p>
          <div className="pp-tabs" role="tablist" aria-label="Mobile grooming payroll view">
            {(["summary", "employee"] as const).map((view) => {
              const active = mobilePayrollView === view;
              return (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={cn("pp-tab capitalize", active && "is-on")}
                  onClick={() => selectMobilePayrollView(view)}
                >
                  {view}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Payroll</h2>
          <p className="mt-1 text-gray-500">
            {isMobileGrooming ? "Weekly mobile grooming appointments" : "Weekly staff hours"}{" "}
            ({payPeriod.rangeLabel})
          </p>
        </div>
        {!isMobileGrooming ? (
          <Button type="button" onClick={() => setShowMoegoImport((open) => !open)}>
            {showMoegoImport ? "Hide MoeGo import" : "Import from MoeGo"}
          </Button>
        ) : null}
      </div>

      {!isMobileGrooming && automationStatus === "needs_review" ? (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="space-y-2 py-4">
            <p className="font-semibold text-amber-950">MoeGo import needs admin review</p>
            <p className="text-sm text-amber-900">
              Existing hours were preserved. Correct the rows if needed, then use Save payroll as the fallback approval.
            </p>
            <ul className="list-disc pl-5 text-sm text-amber-900">
              {reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {!isMobileGrooming && (
        <Card>
          <CardContent className="space-y-4">
            <div
              className={cn(
                "grid gap-3 lg:items-end",
                pendingMoegoImport
                  ? "lg:grid-cols-[minmax(220px,1fr)_180px_180px]"
                  : "lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto]"
              )}
            >
              <Select
                id="payroll-week"
                label="Week"
                value={weekStart}
                onChange={(event) => void loadWeek(event.target.value, business)}
                disabled={loading || saving}
              >
                {weekOptions.map((option) => (
                  <option key={option.weekStart} value={option.weekStart}>
                    {formatWeekRange(option.weekStart, option.weekEnd)}
                    {option.stored ? ` (saved)` : ""}
                  </option>
                ))}
              </Select>
              <Input
                label="Week start"
                type="date"
                value={weekStart}
                onChange={(event) => {
                  setWeekStart(event.target.value);
                  setRows([]);
                  setMobileEntries([]);
                  setPendingMoegoImport(null);
                  setReviewAcknowledged(false);
                }}
                disabled={loading || saving}
              />
              <Input label="Week end" type="date" value={weekEnd} readOnly />
              {!pendingMoegoImport ? (
                <Button
                  type="button"
                  onClick={savePayroll}
                  disabled={loading || saving || unresolvedImportWarnings}
                >
                  {saving ? "Saving..." : "Save payroll"}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {isMobileGrooming && mobilePayrollView === "employee" && (
        <Card>
          <CardContent>
            <div className="max-w-sm">
              <Select
                id="mobile-grooming-employee"
                label="Employee"
                value={selectedMobileEmployee}
                onChange={(event) => addMobileEmployee(event.target.value)}
                disabled={saving || mobileEmployeeChoicesUnavailable}
              >
                <option value="">{mobileEmployeePlaceholder}</option>
                {employeeOptions.map((employee) => {
                  const employeeName = normalizeEmployeeName(employee.name);
                  return (
                    <option key={employee.id} value={employeeName}>
                      {employeeName}
                    </option>
                  );
                })}
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {!isMobileGrooming && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard
            label="Total"
            value={decimalPayrollHours(totals.grandSeconds).toFixed(2)}
            detail={`${totals.employeeCount} employees`}
          />
          {totals.categoryTotals.map((total) => (
            <SummaryCard
              key={total.category}
              label={total.label}
              value={total.decimalHours.toFixed(2)}
              detail={`${total.employeeCount} employees`}
            />
          ))}
        </div>
      )}

      {isMobileGrooming && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {mobileViewEmployeeName
                    ? `${mobileViewEmployeeName} totals for ${annualYear}`
                    : `Mobile grooming totals for ${annualYear}`}
                </h3>
              </div>
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                {(["annual", "weekly"] as const).map((view) => (
                  <button
                    key={view}
                    type="button"
                    onClick={() => setMobileSummaryView(view)}
                    className={cn(
                      "rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors",
                      mobileSummaryView === view
                        ? "bg-white text-gray-900 shadow-sm"
                        : "text-gray-600 hover:text-gray-900"
                    )}
                  >
                    {view}
                  </button>
                ))}
              </div>
            </div>
            {mobileSummaryView === "annual" ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
                <AnnualMetric
                  label="Total Appointments"
                  value={String(annualMobileTotals?.stops ?? 0)}
                />
                <AnnualMetric
                  label="Total Pets"
                  value={String(annualMobileTotals?.dogs ?? 0)}
                />
                <AnnualMetric
                  label="Total Price"
                  value={formatMoney((annualMobileTotals?.pricingCents ?? 0) / 100)}
                />
                <AnnualMetric
                  label="Grooming Price"
                  value={formatMoney(
                    mobileGroomingPriceFromTotals(
                      annualMobileTotals ?? emptyMobileGroomingTotals()
                    ) / 100
                  )}
                />
                <AnnualMetric
                  label="Cash Total"
                  value={formatMoney((annualMobileTotals?.cashCents ?? 0) / 100)}
                />
                <AnnualMetric
                  label="CC Tips"
                  value={formatMoney((annualMobileTotals?.creditCardTipCents ?? 0) / 100)}
                />
                <AnnualMetric
                  label="Groomer Pay"
                  value={formatMoney((annualMobileTotals?.groomerPayCents ?? 0) / 100)}
                />
                <AnnualMetric
                  label="Upgrades ($)"
                  value={formatMoney((annualMobileTotals?.upgradeCents ?? 0) / 100)}
                />
              </div>
            ) : (
              <div className="space-y-3">
                {mobileQuarterGroups.map((quarter) => {
                  const isOpen =
                    openMobileQuarters[quarter.id] ??
                    quarter.weeks.some((week) => week.weekStart === weekStart);
                  return (
                    <div key={quarter.id} className="rounded-lg border border-gray-200">
                      <button
                        type="button"
                        className="flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors hover:bg-gray-50 sm:flex-row sm:items-center sm:justify-between"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setOpenMobileQuarters((current) => ({
                            ...current,
                            [quarter.id]: !isOpen,
                          }))
                        }
                      >
                        <span>
                          <span className="block text-sm font-semibold text-gray-900">
                            {quarter.label}
                          </span>
                          <span className="text-xs text-gray-500">{quarter.range}</span>
                        </span>
                        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                          <span>{quarter.totals.stops} appointments</span>
                          <span>{quarter.totals.dogs} pets</span>
                          <span>{formatMoney(quarter.totals.pricingCents / 100)} total</span>
                          <span>
                            {formatMoney(mobileGroomingPriceFromTotals(quarter.totals) / 100)} grooming
                          </span>
                          <span>
                            {formatMoney(quarter.totals.creditCardTipCents / 100)} cc tips
                          </span>
                          <span className="font-medium text-gray-700">
                            {isOpen ? "Collapse" : "Expand"}
                          </span>
                        </span>
                      </button>
                      {isOpen ? (
                        <div className="overflow-x-auto border-t border-gray-200">
                          <table className="min-w-full divide-y divide-gray-200 text-sm">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Week
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Appointments
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Pets
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Total Price
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Grooming Price
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Cash Total
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  CC Tips
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Groomer Pay
                                </th>
                                <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Upgrades ($)
                                </th>
                                <th className="px-4 py-2 text-right text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                                  Actions
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {quarter.weeks.map((week) => {
                                const isEditing = weeklyTotalsEdit?.weekStart === week.weekStart;
                                const edit = isEditing ? weeklyTotalsEdit : null;
                                return (
                                  <tr
                                    key={week.weekStart}
                                    className={cn(
                                      "transition-colors",
                                      week.weekStart === weekStart ? "bg-blue-50" : "bg-white"
                                    )}
                                  >
                                    <td className="whitespace-nowrap px-4 py-2 font-medium text-gray-900">
                                      {isEditing ? (
                                        <span>{formatWeekRange(week.weekStart, week.weekEnd)}</span>
                                      ) : (
                                        <button
                                          type="button"
                                          className="rounded text-left text-blue-700 hover:text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                          onClick={() =>
                                            void loadWeek(week.weekStart, business, mobileViewEmployeeName)
                                          }
                                        >
                                          {formatWeekRange(week.weekStart, week.weekEnd)}
                                        </button>
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit ? (
                                        <WeeklyTotalsInput
                                          value={edit.stops}
                                          step="1"
                                          onChange={(value) => updateWeeklyTotalsEdit({ stops: value })}
                                          disabled={savingWeeklyTotals}
                                        />
                                      ) : (
                                        week.stops
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit ? (
                                        <WeeklyTotalsInput
                                          value={edit.dogs}
                                          step="1"
                                          onChange={(value) => updateWeeklyTotalsEdit({ dogs: value })}
                                          disabled={savingWeeklyTotals}
                                        />
                                      ) : (
                                        week.dogs
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit ? (
                                        <WeeklyTotalsInput
                                          value={edit.totalPricing}
                                          onChange={(value) =>
                                            updateWeeklyTotalsEdit({ totalPricing: value })
                                          }
                                          disabled={savingWeeklyTotals}
                                        />
                                      ) : (
                                        formatMoney(week.pricingCents / 100)
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit
                                        ? formatMoney(weeklyTotalsEditGroomingPrice(edit))
                                        : formatMoney(mobileGroomingPriceFromTotals(week) / 100)}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit ? (
                                        <WeeklyTotalsInput
                                          value={edit.cashTotal}
                                          onChange={(value) =>
                                            updateWeeklyTotalsEdit({ cashTotal: value })
                                          }
                                          disabled={savingWeeklyTotals}
                                        />
                                      ) : (
                                        formatMoney(week.cashCents / 100)
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit ? (
                                        <WeeklyTotalsInput
                                          value={edit.creditCardTips}
                                          onChange={(value) =>
                                            updateWeeklyTotalsEdit({ creditCardTips: value })
                                          }
                                          disabled={savingWeeklyTotals}
                                        />
                                      ) : (
                                        formatMoney(week.creditCardTipCents / 100)
                                      )}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit
                                        ? formatMoney(weeklyTotalsEditGroomerPay(edit))
                                        : formatMoney(week.groomerPayCents / 100)}
                                    </td>
                                    <td className="px-4 py-2 text-gray-700">
                                      {edit ? (
                                        <WeeklyTotalsInput
                                          value={edit.upgrades}
                                          onChange={(value) => updateWeeklyTotalsEdit({ upgrades: value })}
                                          disabled={savingWeeklyTotals}
                                        />
                                      ) : (
                                        formatMoney(week.upgradeCents / 100)
                                      )}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-2 text-right">
                                      {mobileViewEmployeeKey ? null : edit ? (
                                        <div className="flex justify-end gap-2">
                                          <button
                                            type="button"
                                            onClick={() => void saveWeeklyTotalsEdit()}
                                            disabled={savingWeeklyTotals}
                                            className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-50"
                                          >
                                            {savingWeeklyTotals ? "Saving..." : "Save"}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setWeeklyTotalsEdit(null)}
                                            disabled={savingWeeklyTotals}
                                            className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:pointer-events-none disabled:opacity-50"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => startWeeklyTotalsEdit(week)}
                                          disabled={savingWeeklyTotals}
                                          className="rounded-md px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 disabled:pointer-events-none disabled:opacity-50"
                                        >
                                          Edit
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {!isMobileGrooming && showMoegoImport && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">Import Pet Resort hours from MoeGo</h2>
                <p className="mt-1 max-w-2xl text-sm text-gray-600">
                  Open the Clock in/out record, select the Sunday-Saturday week and 100/page,
                  then paste or upload the extractor JSON here. Nothing is saved until you review
                  the employee totals and click Save payroll.
                </p>
              </div>
              <Button type="button" variant="secondary" onClick={openMoegoClockInOut}>
                Open MoeGo clock-in/out
              </Button>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label
                  htmlFor="payroll-import"
                  className="block text-sm font-medium text-gray-700"
                >
                  Import JSON
                </label>
                <textarea
                  id="payroll-import"
                  value={importText}
                  onChange={(event) => setImportText(event.target.value)}
                  className="mt-1 block min-h-[90px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder='{"weekStart":"2026-06-28","weekEnd":"2026-07-04","rows":[...]}'
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => applyImportText(importText)}
                  disabled={saving || !importText.trim()}
                >
                  Review JSON
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void pasteImportFromClipboard()}
                  disabled={saving}
                >
                  Paste from clipboard
                </Button>
                <label className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-gray-200 px-4 py-2 text-sm font-medium text-gray-900 transition-colors hover:bg-gray-300">
                  Upload file
                  <input
                    type="file"
                    accept=".json,.txt,application/json,text/plain"
                    className="sr-only"
                    onChange={handleFileUpload}
                    disabled={saving}
                  />
                </label>
              </div>
            </div>
            {pendingMoegoImport ? (
              <div
                className={cn(
                  "rounded-lg border p-4",
                  pendingMoegoImport.warnings.length
                    ? "border-amber-300 bg-amber-50"
                    : "border-emerald-200 bg-emerald-50"
                )}
              >
                <p className="font-medium text-gray-900">
                  {pendingMoegoImport.warnings.length
                    ? "Admin review required before saving"
                    : "MoeGo data is ready for final review"}
                </p>
                <p className="mt-1 text-sm text-gray-700">
                  {rows.length} employees · {pendingMoegoImport.rowCount ?? "Unknown"} completed shifts · {formatWeekRange(weekStart, weekEnd)}
                </p>
                {pendingMoegoImport.warnings.length ? (
                  <>
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-950">
                      {pendingMoegoImport.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                    <label className="mt-3 flex items-start gap-2 text-sm font-medium text-amber-950">
                      <input
                        type="checkbox"
                        checked={reviewAcknowledged}
                        onChange={(event) => setReviewAcknowledged(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-amber-400"
                      />
                      I reviewed the incomplete shifts and corrected the employee totals below.
                    </label>
                  </>
                ) : null}
                <div className="mt-4 flex flex-col gap-3 border-t border-current/15 pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-700">
                    {unresolvedImportWarnings
                      ? "Acknowledge the review above to enable saving."
                      : "Employee totals are reviewed and ready to save."}
                  </p>
                  <Button
                    type="button"
                    onClick={savePayroll}
                    disabled={loading || saving || unresolvedImportWarnings}
                  >
                    {saving ? "Saving..." : "Save payroll"}
                  </Button>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3">
          <div
            className={cn(
              "flex gap-3",
              isMobileGrooming
                ? "flex-col md:flex-row md:items-end md:justify-between"
                : "items-center justify-between"
            )}
          >
            <h2 className="text-base font-semibold text-gray-900">
              {isMobileGrooming ? mobileAppointmentsTitle : "Employee hours"}
            </h2>
            {isMobileGrooming ? (
              <div
                className={cn(
                  "grid w-full gap-3 md:items-end",
                  showMobileAppointmentDetails
                    ? "md:max-w-3xl md:grid-cols-[minmax(220px,1fr)_auto_auto_auto]"
                    : "md:max-w-2xl md:grid-cols-[minmax(220px,1fr)_auto_auto]"
                )}
              >
                <Select
                  id="payroll-week"
                  label="Week"
                  value={weekStart}
                  onChange={(event) =>
                    void loadWeek(event.target.value, business, mobileViewEmployeeName)
                  }
                  disabled={loading || saving}
                >
                  {weekOptions.map((option) => (
                    <option key={option.weekStart} value={option.weekStart}>
                      {formatWeekRange(option.weekStart, option.weekEnd)}
                      {mobilePayrollView === "summary" && option.stored ? ` (saved)` : ""}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={pullMobileGroomingFromMoego}
                  disabled={
                    loading ||
                    saving ||
                    pullingMoego ||
                    (mobilePayrollView === "employee" && !selectedMobileEmployee)
                  }
                >
                  {pullMoegoLabel}
                </Button>
                <Button
                  type="button"
                  onClick={savePayroll}
                  disabled={
                    loading ||
                    saving ||
                    (mobilePayrollView === "employee" && !selectedMobileEmployee)
                  }
                >
                  {saving ? "Saving..." : "Save payroll"}
                </Button>
                {showMobileAppointmentDetails ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setMobileStopsOpen((current) => !current)}
                  >
                    {mobileStopsOpen ? "Collapse" : "Expand"}
                  </Button>
                ) : null}
              </div>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addRow}
                disabled={saving}
              >
                Add employee
              </Button>
            )}
          </div>

          {isMobileGrooming ? (
            <>
              {showMobileAppointmentMetrics ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-8">
                  <WeeklyMetric
                    label="Total Appointments"
                    value={String(selectedWeekMobileTotals.stops)}
                  />
                  <WeeklyMetric label="Total Pets" value={String(selectedWeekMobileTotals.dogs)} />
                  <WeeklyMetric
                    label="Total Price"
                    value={formatMoney(selectedWeekMobileTotals.pricing)}
                  />
                  <WeeklyMetric
                    label="Grooming Price"
                    value={formatMoney(selectedWeekMobileTotals.groomingPrice)}
                  />
                  <WeeklyMetric
                    label="Cash Total"
                    value={formatMoney(selectedWeekMobileTotals.cash)}
                  />
                  <WeeklyMetric
                    label="CC Tips"
                    value={formatMoney(selectedWeekMobileTotals.creditCardTips)}
                  />
                  <WeeklyMetric
                    label="Groomer Pay"
                    value={formatMoney(selectedWeekMobileTotals.groomerPay)}
                  />
                  <WeeklyMetric
                    label="Upgrades ($)"
                    value={formatMoney(selectedWeekMobileTotals.upgrades)}
                  />
                </div>
              ) : (
                <p className="rounded-lg border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-500">
                  Select an employee to view mobile grooming appointments for this week.
                </p>
              )}

              {showMobileAppointmentDetails && mobileStopsOpen ? (
                <div className="grid gap-3">
                  {weekDays.map((day) => {
                    const dayEntries = visibleMobileEntries.filter(
                      (entry) => entry.serviceDate === day.value
                    );
                    const dayTotal = dayEntries.reduce(
                      (sum, entry) => sum + mobileEntryTotalPrice(entry),
                      0
                    );
                    const dayPay = dayEntries.reduce(
                      (sum, entry) => sum + mobileEntryGroomerPay(entry),
                      0
                    );
                    const dayTips = dayEntries.reduce(
                      (sum, entry) => sum + moneyValue(entry.creditCardTip),
                      0
                    );
                    return (
                      <div key={day.value} className="rounded-lg border border-gray-200 bg-white">
                        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{day.label}</h3>
                            <p className="text-xs text-gray-500">
                              {dayEntries.length} appointments · {formatMoney(dayTotal)} total ·{" "}
                              {formatMoney(dayPay)} groomer pay · {formatMoney(dayTips)} cc tips
                            </p>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={() => addMobileEntry(day.value)}
                            disabled={
                              saving ||
                              mobilePayrollView !== "employee" ||
                              mobileEmployeeChoicesUnavailable ||
                              !selectedMobileEmployee
                            }
                          >
                            + Appointment
                          </Button>
                        </div>

                        {dayEntries.length === 0 ? (
                          <p className="px-4 py-6 text-center text-sm text-gray-500">
                            No appointments for this day.
                          </p>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {dayEntries.map((entry) => (
                              <MobileGroomingEntryEditor
                                key={entry.localId}
                                entry={entry}
                                saving={saving}
                                onChange={(patch) => updateMobileEntry(entry.localId, patch)}
                                onRemove={() => removeMobileEntry(entry.localId)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader className="min-w-[220px]">Employee</TableHeader>
                  <TableHeader>Business</TableHeader>
                  <TableHeader className="w-[120px]">Shifts</TableHeader>
                  <TableHeader className="w-[150px]">Total hours</TableHeader>
                  <TableHeader className="w-[90px]">Actions</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-gray-500">
                      No employee hours for this week.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => {
                    const category = categoryForEmployee(row.employeeName, business);
                    return (
                      <TableRow key={row.localId}>
                        <TableCell>
                          <input
                            value={row.employeeName}
                            onChange={(event) =>
                              updateRow(row.localId, { employeeName: event.target.value })
                            }
                            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant={categoryBadgeVariant(category)}>
                            {PAYROLL_CATEGORY_LABELS[category]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={row.shifts}
                            onChange={(event) =>
                              updateRow(row.localId, { shifts: event.target.value })
                            }
                            className="w-24 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.decimalHours}
                            onChange={(event) =>
                              updateRow(row.localId, { decimalHours: event.target.value })
                            }
                            className="w-28 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                            disabled={saving}
                          />
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => removeRow(row.localId)}
                            className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
                            disabled={saving}
                          >
                            Remove
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(message || error) && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
          )}
        >
          {error || message}
        </div>
      )}
    </div>
  );
}

function MobileGroomingEntryEditor({
  entry,
  saving,
  onChange,
  onRemove,
}: {
  entry: EditableMobileGroomingEntry;
  saving: boolean;
  onChange: (patch: Partial<EditableMobileGroomingEntry>) => void;
  onRemove: () => void;
}) {
  const fieldClass =
    "w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

  return (
    <div className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(160px,1.3fr)_120px_90px_repeat(5,minmax(100px,1fr))_110px_110px_auto] xl:items-end">
      <div>
        <label className="block text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
          Groomer
        </label>
        <p className="mt-1 text-sm font-medium text-gray-900">{entry.employeeName}</p>
      </div>
      <label className="block">
        <span className="block text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
          Payment
        </span>
        <select
          value={entry.paymentType}
          onChange={(event) =>
            onChange({ paymentType: event.target.value === "cash" ? "cash" : "credit" })
          }
          className={cn(fieldClass, "mt-1")}
          disabled={saving}
        >
          <option value="credit">Credit</option>
          <option value="cash">Cash</option>
        </select>
      </label>
      <EntryInput
        label="# Pets"
        value={entry.dogs}
        onChange={(value) => onChange({ dogs: value })}
        disabled={saving}
        step="1"
      />
      <EntryInput
        label="Grooming Price"
        value={entry.price}
        onChange={(value) => onChange({ price: value })}
        disabled={saving}
      />
      <EntryInput
        label="Upgrades Qty"
        value={entry.upgradeQuantity}
        onChange={(value) => onChange({ upgradeQuantity: value })}
        disabled={saving}
        step="1"
      />
      <EntryInput
        label="Upgrades $"
        value={entry.upgradeAmount}
        onChange={(value) => onChange({ upgradeAmount: value })}
        disabled={saving}
      />
      <EntryInput
        label="CC Tip"
        value={entry.creditCardTip}
        onChange={(value) => onChange({ creditCardTip: value })}
        disabled={saving}
      />
      <EntryInput
        label="Discount"
        value={entry.discount}
        onChange={(value) => onChange({ discount: value })}
        disabled={saving}
      />
      <CalculatedValue label="Groomer Pay" value={formatMoney(mobileEntryGroomerPay(entry))} />
      <CalculatedValue label="Total Price" value={formatMoney(mobileEntryTotalPrice(entry))} />
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
        disabled={saving}
      >
        Remove
      </button>
    </div>
  );
}

function EntryInput({
  label,
  value,
  onChange,
  disabled,
  step = "0.01",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  step?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
        {label}
      </span>
      <input
        type="number"
        min="0"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        disabled={disabled}
      />
    </label>
  );
}

function CalculatedValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
        {label}
      </span>
      <p className="mt-1 rounded-md bg-gray-50 px-2.5 py-1.5 text-sm font-semibold text-gray-900">
        {value}
      </p>
    </div>
  );
}

function AnnualMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function WeeklyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 px-3 py-2">
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function WeeklyTotalsInput({
  value,
  onChange,
  disabled,
  step = "0.01",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  step?: string;
}) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      disabled={disabled}
    />
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-gray-500">{label}</p>
        <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
        <p className="mt-1 text-xs text-gray-500">{detail}</p>
      </CardContent>
    </Card>
  );
}
