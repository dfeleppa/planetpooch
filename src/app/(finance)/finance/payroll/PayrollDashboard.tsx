"use client";

import { ChangeEvent, Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type DailyReconciliation = {
  serviceDate: string;
  employeeName: string;
  expectedCashCents: number;
  countedCashCents: number;
  note: string;
  reconciledAt: string;
};

type PayoutPreview = {
  expectedCashCents: number;
  countedCashCents: number;
  adjustmentCents: number;
  cashPayoutCents: number;
  expectedDepositCents: number;
  payouts: Array<{
    employeeName: string;
    commissionPayCents: number;
    creditCardTipCents: number;
    basePayCents: number;
    payKind: "fixed" | "additive" | null;
    groomerPayCents: number;
    priorPeriodAdjustmentCents: number;
    priorPeriodCorrections: Array<{
      id: string;
      sourceWeekStart: string;
      sourceWeekEnd: string;
      amountCents: number;
      breakdown: Array<{ reason: string; amountCents: number }> | null;
    }>;
    weeklyPayCents: number;
    payPrepared: boolean;
    payLock: {
      earnedPayCents: number;
      weeklyPayCents: number;
      cashPayoutCents: number;
      lockedAt: string;
    } | null;
    directDepositCents: number;
    adjustmentCents: number;
    adjustmentNote: string;
    adjustmentDate: string | null;
    cashPayoutCents: number;
    directDepositSet: boolean;
    varianceCents: number;
    hasWorkedDays: boolean;
    varianceReviewed: boolean;
    applyVarianceToCashPayout: boolean | null;
    variancePayoutCents: number;
  }>;
  workedDays: number;
  reconciledDays: number;
  missingDays: string[];
  staleDays: string[];
  missingDepositSettings: string[];
  negativeCashPayouts: string[];
  pendingVarianceReviews: string[];
  sourceFingerprint: string;
};

type WeeklyCloseout = {
  finalDepositCents: number;
  expectedDepositCents: number;
  varianceCents: number;
  note: string;
  closedAt: string;
  sourceFingerprint: string;
};

type CloseoutResponse = {
  preview: PayoutPreview;
  closeout: WeeklyCloseout | null;
  closeoutCurrent: boolean;
  weekCompleted: boolean;
  error?: string;
};

type PostPayoutChangesResponse = {
  changes: Array<{
    id: string;
    employeeName: string;
    sourceWeekStart: string;
    sourceWeekEnd: string;
    targetWeekStart: string;
    targetWeekEnd: string;
    targetClosedAt: string | null;
    baselinePayCents: number;
    revisedPayCents: number;
    amountCents: number;
    detectedAt: string;
    breakdown: Array<{ reason: string; amountCents: number }> | null;
  }>;
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
type MobilePayrollView = "summary" | "employee" | "report" | "reconciliation" | "changes";
type ReconciliationView = "employee" | "weekly" | "payouts";
type CloseoutStep = "idle" | "days" | "employees" | "deposit";

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

function completedPayrollWeeksForYear(
  year: number,
  business: PayrollBusinessValue
): Array<{ weekStart: string; weekEnd: string }> {
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const daysUntilFriday = (5 - firstDay.getUTCDay() + 7) % 7;
  const firstWeekEnd = new Date(firstDay.getTime() + daysUntilFriday * MS_PER_DAY);
  const lastCompletedEnd = dateFromParam(addDaysParam(lastCompletedWeekStart(business), 6));
  const weeks: Array<{ weekStart: string; weekEnd: string }> = [];

  for (
    let weekEnd = firstWeekEnd;
    weekEnd.getUTCFullYear() === year && weekEnd <= lastCompletedEnd;
    weekEnd = new Date(weekEnd.getTime() + 7 * MS_PER_DAY)
  ) {
    const weekEndParam = toDateParam(weekEnd);
    weeks.push({
      weekStart: addDaysParam(weekEndParam, -6),
      weekEnd: weekEndParam,
    });
  }

  return weeks.reverse();
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

function formatWeekEnding(weekEnd: string) {
  return `Week ending ${dateFromParam(weekEnd).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
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

function mobileTotalsForEntries(entries: EditableMobileGroomingEntry[]) {
  return entries.reduce(
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
}

function formatMoney(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatSignedMoney(cents: number): string {
  if (cents > 0) return `+${formatMoney(cents / 100)}`;
  if (cents < 0) return `-${formatMoney(Math.abs(cents) / 100)}`;
  return formatMoney(0);
}

function formatCashDifference(cents: number): string {
  return cents === 0
    ? "Even"
    : `${formatMoney(Math.abs(cents) / 100)} ${cents > 0 ? "over" : "short"}`;
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
  const [mobilePayrollView, setMobilePayrollView] = useState<MobilePayrollView>("summary");
  const [reportYear, setReportYear] = useState(() =>
    dateFromParam(addDaysParam(lastCompletedWeekStart("mobile-grooming"), 6)).getUTCFullYear()
  );
  const [openMobileQuarters, setOpenMobileQuarters] = useState<Record<string, boolean>>({});
  const [weeklyTotalsEdit, setWeeklyTotalsEdit] = useState<WeeklyTotalsEdit | null>(null);
  const [savingWeeklyTotals, setSavingWeeklyTotals] = useState(false);
  const [selectedMobileEmployee, setSelectedMobileEmployee] = useState("");
  const [reconciliationView, setReconciliationView] = useState<ReconciliationView>("employee");
  const [reconciliationEmployee, setReconciliationEmployee] = useState("");
  const [reconciliations, setReconciliations] = useState<DailyReconciliation[]>([]);
  const [openReconciliationDay, setOpenReconciliationDay] = useState<string | null>(null);
  const [countedCashDraft, setCountedCashDraft] = useState("");
  const [reconciliationNoteDraft, setReconciliationNoteDraft] = useState("");
  const [savingReconciliation, setSavingReconciliation] = useState(false);
  const [loadingReconciliations, setLoadingReconciliations] = useState(false);
  const [loadingDirectDeposits, setLoadingDirectDeposits] = useState(false);
  const [depositEditEmployee, setDepositEditEmployee] = useState<string | null>(null);
  const [depositDraft, setDepositDraft] = useState("");
  const [savingDirectDeposit, setSavingDirectDeposit] = useState(false);
  const [savingPayPreparation, setSavingPayPreparation] = useState<string | null>(null);
  const [savingPayLock, setSavingPayLock] = useState<string | null>(null);
  const [adjustmentEditEmployee, setAdjustmentEditEmployee] = useState<string | null>(null);
  const [adjustmentDraft, setAdjustmentDraft] = useState("");
  const [adjustmentNoteDraft, setAdjustmentNoteDraft] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [closeoutData, setCloseoutData] = useState<CloseoutResponse | null>(null);
  const [postPayoutChanges, setPostPayoutChanges] = useState<PostPayoutChangesResponse | null>(null);
  const [loadingPostPayoutChanges, setLoadingPostPayoutChanges] = useState(false);
  const [postPayoutCheckWeeks, setPostPayoutCheckWeeks] = useState<Array<{ weekStart: string; weekEnd: string }>>([]);
  const [postPayoutCheckWeekStart, setPostPayoutCheckWeekStart] = useState("");
  const [loadingPostPayoutCheckWeeks, setLoadingPostPayoutCheckWeeks] = useState(false);
  const [checkingPostPayout, setCheckingPostPayout] = useState(false);
  const [postPayoutCheckResult, setPostPayoutCheckResult] = useState<string | null>(null);
  const [finalDepositDraft, setFinalDepositDraft] = useState("");
  const [closeoutNoteDraft, setCloseoutNoteDraft] = useState("");
  const [savingCloseout, setSavingCloseout] = useState(false);
  const [closeoutStep, setCloseoutStep] = useState<CloseoutStep>("idle");
  const [savingVarianceReview, setSavingVarianceReview] = useState<string | null>(null);
  const [printingPaystubs, setPrintingPaystubs] = useState(false);
  const payoutRequestId = useRef(0);
  const [mobileStopsOpen, setMobileStopsOpen] = useState(true);
  const [weeklyCashOpen, setWeeklyCashOpen] = useState(false);
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
  const currentMobileWeekStart = addDaysParam(lastCompletedWeekStart("mobile-grooming"), 7);
  const reconciliationWeeks = Array.from({ length: 4 }, (_, index) => {
    const start = addDaysParam(currentMobileWeekStart, -index * 7);
    return { weekStart: start, weekEnd: addDaysParam(start, 6) };
  });
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
    if (business === "mobile-grooming") {
      const currentWeekStart = addDaysParam(lastCompletedWeekStart(business), 7);
      if (!byStart.has(currentWeekStart)) {
        byStart.set(currentWeekStart, {
          weekStart: currentWeekStart,
          weekEnd: addDaysParam(currentWeekStart, 6),
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

  const reportYearOptions = useMemo(() => {
    const years = new Set<number>([
      dateFromParam(addDaysParam(lastCompletedWeekStart("mobile-grooming"), 6)).getUTCFullYear(),
      dateFromParam(weekEnd).getUTCFullYear(),
    ]);
    for (const week of savedWeeks) {
      if (week.business === "mobile-grooming") {
        years.add(dateFromParam(week.weekEnd).getUTCFullYear());
      }
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [savedWeeks, weekEnd]);

  const reportWeekOptions = useMemo(
    () => completedPayrollWeeksForYear(reportYear, "mobile-grooming"),
    [reportYear]
  );

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
  const reconciliationDays = weekDays.map((day) => ({
    ...day,
    entries: mobileEntries.filter(
      (entry) =>
        day.value === entry.serviceDate &&
        normalizeEmployeeName(entry.employeeName).toLocaleLowerCase() ===
          normalizeEmployeeName(reconciliationEmployee).toLocaleLowerCase()
    ),
  })).filter((day) => day.entries.length > 0);

  const reconciliationWeeklyExpectedCash = reconciliationDays.reduce(
    (sum, day) => sum + mobileTotalsForEntries(day.entries).cash,
    0
  );
  const workedDayDates = new Set(reconciliationDays.map((day) => day.value));
  const reconciliationWeeklyRecords = reconciliations.filter(
    (record) =>
      workedDayDates.has(record.serviceDate) &&
      normalizeEmployeeName(record.employeeName).toLocaleLowerCase() ===
        normalizeEmployeeName(reconciliationEmployee).toLocaleLowerCase()
  );
  const reconciliationWeeklyCountedCashCents = reconciliationWeeklyRecords.reduce(
    (sum, record) => sum + record.countedCashCents,
    0
  );
  const reconciliationWeeklyDifferenceCents = reconciliationWeeklyRecords.reduce(
    (sum, record) => sum + record.countedCashCents - record.expectedCashCents,
    0
  );
  const allEmployeeReconciliationGroups = useMemo(() => {
    const byEmployee = new Map<string, { employeeName: string; entries: EditableMobileGroomingEntry[] }>();
    for (const entry of mobileEntries) {
      const employeeName = normalizeEmployeeName(entry.employeeName);
      const key = employeeName.toLocaleLowerCase();
      if (!key) continue;
      const group = byEmployee.get(key) ?? { employeeName, entries: [] };
      group.entries.push(entry);
      byEmployee.set(key, group);
    }
    return Array.from(byEmployee.entries()).map(([key, group]) => {
      const dates = Array.from(new Set(group.entries.map((entry) => entry.serviceDate)));
      const records = reconciliations.filter(
        (record) => record.employeeName.toLocaleLowerCase() === key && dates.includes(record.serviceDate)
      );
      const staleDays = records.filter((record) => {
        const entries = group.entries.filter((entry) => entry.serviceDate === record.serviceDate);
        return record.expectedCashCents !== Math.round(mobileTotalsForEntries(entries).cash * 100);
      }).length;
      return {
        employeeName: group.employeeName,
        expectedCash: mobileTotalsForEntries(group.entries).cash,
        countedCashCents: records.reduce((sum, record) => sum + record.countedCashCents, 0),
        differenceCents: records.reduce(
          (sum, record) => sum + record.countedCashCents - record.expectedCashCents,
          0
        ),
        workedDays: dates.length,
        reconciledDays: records.length,
        staleDays,
      };
    }).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [mobileEntries, reconciliations]);
  const allEmployeeExpectedCash = allEmployeeReconciliationGroups.reduce(
    (sum, group) => sum + group.expectedCash, 0
  );
  const allEmployeeCountedCashCents = allEmployeeReconciliationGroups.reduce(
    (sum, group) => sum + group.countedCashCents, 0
  );
  const allEmployeeDifferenceCents = allEmployeeReconciliationGroups.reduce(
    (sum, group) => sum + group.differenceCents, 0
  );
  const allEmployeeWorkedDays = allEmployeeReconciliationGroups.reduce(
    (sum, group) => sum + group.workedDays, 0
  );
  const allEmployeeReconciledDays = allEmployeeReconciliationGroups.reduce(
    (sum, group) => sum + group.reconciledDays, 0
  );
  const allEmployeeStaleDays = allEmployeeReconciliationGroups.reduce(
    (sum, group) => sum + group.staleDays, 0
  );

  const selectedWeekMobileTotals = useMemo(
    () => mobileTotalsForEntries(visibleMobileEntries),
    [visibleMobileEntries]
  );

  const weeklyCashByDay = useMemo(
    () =>
      weekDays.map((day) => ({
        ...day,
        cash: visibleMobileEntries
          .filter((entry) => entry.serviceDate === day.value && entry.paymentType === "cash")
          .reduce((sum, entry) => sum + mobileEntryTotalPrice(entry), 0),
      })),
    [visibleMobileEntries, weekDays]
  );

  const mobileWeeklyReportGroups = useMemo(() => {
    const byEmployee = new Map<string, EditableMobileGroomingEntry[]>();
    for (const entry of mobileEntries) {
      const employeeName = normalizeEmployeeName(entry.employeeName);
      if (!employeeName) continue;
      const current = byEmployee.get(employeeName) ?? [];
      current.push(entry);
      byEmployee.set(employeeName, current);
    }

    return Array.from(byEmployee, ([employeeName, entries]) => ({
      employeeName,
      entries: [...entries].sort((a, b) => a.serviceDate.localeCompare(b.serviceDate)),
      totals: mobileTotalsForEntries(entries),
    })).sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: "base" })
    );
  }, [mobileEntries]);

  useEffect(() => {
    if (!printingPaystubs) return;
    const originalTitle = document.title;
    const restore = () => {
      document.title = originalTitle;
      setPrintingPaystubs(false);
    };
    document.title = `Planet Pooch Mobile Grooming Paystubs - ${formatWeekRange(weekStart, weekEnd)}`;
    window.addEventListener("afterprint", restore, { once: true });
    window.print();
    return () => {
      window.removeEventListener("afterprint", restore);
      document.title = originalTitle;
    };
  }, [printingPaystubs, weekStart, weekEnd]);

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
    mobilePayrollView === "report"
      ? "Weekly mobile grooming report"
      : mobilePayrollView === "summary"
        ? "All mobile grooming appointments"
        : "Mobile grooming appointments";
  const showMobileAppointmentMetrics =
    mobilePayrollView !== "employee" || Boolean(mobileViewEmployeeName);
  const showMobileAppointmentDetails =
    mobilePayrollView === "employee" && Boolean(mobileViewEmployeeName);
  const idlePullMoegoLabel =
    mobilePayrollView === "summary" ? "Pull Entire Staff from MoeGo" : "Pull from MoeGo";
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

  useEffect(() => {
    if (mobilePayrollView !== "reconciliation") return;
    const controller = new AbortController();
    setReconciliations([]);
    setLoadingReconciliations(true);
    void fetch(`/api/finance/payroll/mobile-grooming/reconciliation?weekStart=${weekStart}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = (await response.json()) as { reconciliations?: DailyReconciliation[]; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load reconciliations.");
        setReconciliations(data.reconciliations ?? []);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setError(error instanceof Error ? error.message : "Could not load reconciliations.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingReconciliations(false);
      });
    return () => controller.abort();
  }, [mobilePayrollView, weekStart]);

  const loadPayouts = useCallback(async (selectedWeekStart: string) => {
    const requestId = ++payoutRequestId.current;
    setLoadingDirectDeposits(true);
    setError(null);
    try {
      const response = await fetch(`/api/finance/payroll/mobile-grooming/closeout?weekStart=${selectedWeekStart}`);
      const data = (await response.json()) as CloseoutResponse;
      if (!response.ok) throw new Error(data.error || "Could not load payouts.");
      if (requestId !== payoutRequestId.current) return;
      setCloseoutData(data);
      setFinalDepositDraft(data.closeout ? (data.closeout.finalDepositCents / 100).toFixed(2) : "");
      setCloseoutNoteDraft(data.closeout?.note ?? "");
    } catch (error) {
      if (requestId === payoutRequestId.current) {
        setError(error instanceof Error ? error.message : "Could not load payouts.");
      }
    } finally {
      if (requestId === payoutRequestId.current) setLoadingDirectDeposits(false);
    }
  }, []);

  useEffect(() => {
    if (mobilePayrollView !== "reconciliation" || (reconciliationView !== "payouts" && reconciliationView !== "weekly")) return;
    setCloseoutData(null);
    void loadPayouts(weekStart);
  }, [mobilePayrollView, reconciliationView, weekStart, loadPayouts]);

  useEffect(() => {
    if (mobilePayrollView !== "changes") return;
    const controller = new AbortController();
    setPostPayoutChanges(null);
    setLoadingPostPayoutChanges(true);
    void fetch("/api/finance/payroll/mobile-grooming/post-payout-changes", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as PostPayoutChangesResponse;
        if (!response.ok) throw new Error(data.error || "Could not load post-payout changes.");
        if (!controller.signal.aborted) setPostPayoutChanges(data);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load post-payout changes.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPostPayoutChanges(false);
      });
    return () => controller.abort();
  }, [mobilePayrollView]);

  useEffect(() => {
    if (mobilePayrollView !== "changes") return;
    const controller = new AbortController();
    setLoadingPostPayoutCheckWeeks(true);
    void fetch("/api/finance/payroll/mobile-grooming/post-payout-check", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json()) as { weeks?: Array<{ weekStart: string; weekEnd: string }>; error?: string };
        if (!response.ok) throw new Error(data.error || "Could not load paid out weeks.");
        if (controller.signal.aborted) return;
        const weeks = data.weeks ?? [];
        setPostPayoutCheckWeeks(weeks);
        setPostPayoutCheckWeekStart((selected) => weeks.some((week) => week.weekStart === selected)
          ? selected : weeks[0]?.weekStart ?? "");
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : "Could not load paid out weeks.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPostPayoutCheckWeeks(false);
      });
    return () => controller.abort();
  }, [mobilePayrollView]);

  async function savePayPreparation(employeeName: string, prepared: boolean) {
    setSavingPayPreparation(employeeName);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/closeout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, employeeName, prepared }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save pay preparation.");
      await loadPayouts(weekStart);
      setMessage(`Pay for ${employeeName} marked ${prepared ? "prepared" : "not prepared"}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save pay preparation.");
    } finally {
      setSavingPayPreparation(null);
    }
  }

  async function lockEmployeePay(employeeName: string) {
    setSavingPayLock(employeeName);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/closeout", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock", weekStart, employeeName, sourceFingerprint: closeoutData?.preview.sourceFingerprint }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not lock employee pay.");
      await loadPayouts(weekStart);
      setMessage(`${employeeName}'s paid amount is locked for this week.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not lock employee pay.");
    } finally {
      setSavingPayLock(null);
    }
  }

  async function checkPostPayoutChanges() {
    if (!postPayoutCheckWeekStart) return;
    setCheckingPostPayout(true);
    setPostPayoutCheckResult(null);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/post-payout-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart: postPayoutCheckWeekStart }),
      });
      const result = (await response.json()) as { checkedCount?: number; lockedCount?: number; discrepancyCount?: number; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not check locked pay.");
      const ledgerResponse = await fetch("/api/finance/payroll/mobile-grooming/post-payout-changes");
      const ledger = (await ledgerResponse.json()) as PostPayoutChangesResponse;
      if (!ledgerResponse.ok) throw new Error(ledger.error || "Could not reload the pay ledger.");
      setPostPayoutChanges(ledger);
      const selectedWeek = postPayoutCheckWeeks.find((week) => week.weekStart === postPayoutCheckWeekStart);
      setPostPayoutCheckResult(`Checked ${formatWeekRange(postPayoutCheckWeekStart, selectedWeek?.weekEnd ?? addDaysParam(postPayoutCheckWeekStart, 6))}: ${result.checkedCount ?? 0} paid out employee payments, ${result.discrepancyCount ?? 0} pay discrepancies found.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not check locked pay.");
    } finally {
      setCheckingPostPayout(false);
    }
  }

  async function saveDirectDeposit(employeeName: string) {
    const trimmed = depositDraft.trim();
    const amount = Number(trimmed);
    if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed) ||
        !Number.isSafeInteger(Math.round(amount * 100)) ||
        Math.round(amount * 100) > 2_147_483_647) {
      setError("Enter a direct deposit amount with no more than two decimal places.");
      return;
    }
    setSavingDirectDeposit(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/payouts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeName, weekStart, amountCents: Math.round(amount * 100) }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save direct deposit.");
      setDepositEditEmployee(null);
      setMessage(`Direct deposit saved for ${employeeName}.`);
      await loadPayouts(weekStart);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save direct deposit.");
    } finally {
      setSavingDirectDeposit(false);
    }
  }

  async function saveAdjustment(employeeName: string) {
    const trimmed = adjustmentDraft.trim();
    const amount = Number(trimmed);
    if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(trimmed) ||
        !Number.isSafeInteger(Math.round(amount * 100)) ||
        Math.abs(Math.round(amount * 100)) > 2_147_483_647) {
      setError("Enter a positive or negative adjustment with no more than two decimal places.");
      return;
    }
    if (adjustmentNoteDraft.trim().length > 1000 || (amount !== 0 && !adjustmentNoteDraft.trim())) {
      setError("Add a note for a nonzero adjustment, up to 1,000 characters.");
      return;
    }
    setSavingAdjustment(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/payouts/adjustments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          employeeName,
          amountCents: Math.round(amount * 100),
          note: adjustmentNoteDraft.trim(),
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save payout adjustment.");
      setAdjustmentEditEmployee(null);
      setMessage(`Payout adjustment saved for ${employeeName}.`);
      await loadPayouts(weekStart);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save payout adjustment.");
    } finally {
      setSavingAdjustment(false);
    }
  }

  async function saveWeeklyCloseout() {
    const trimmed = finalDepositDraft.trim();
    const amount = Number(trimmed);
    if (!/^\d+(?:\.\d{1,2})?$/.test(trimmed) ||
        !Number.isSafeInteger(Math.round(amount * 100)) ||
        Math.round(amount * 100) > 2_147_483_647) {
      setError("Enter the final deposited cash amount with no more than two decimal places.");
      return;
    }
    setSavingCloseout(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/closeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          finalDepositCents: Math.round(amount * 100),
          note: closeoutNoteDraft.trim(),
          sourceFingerprint: closeoutData?.preview.sourceFingerprint,
        }),
      });
      const data = (await response.json()) as CloseoutResponse;
      if (!response.ok) throw new Error(data.error || "Could not close the payroll week.");
      setCloseoutData(data);
      setCloseoutStep("idle");
      setMessage("Weekly cash closeout saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not close the payroll week.");
    } finally {
      setSavingCloseout(false);
    }
  }

  async function saveVarianceReview(employeeName: string, applyToCashPayout: boolean) {
    setSavingVarianceReview(employeeName);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/closeout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekStart, employeeName, applyToCashPayout }),
      });
      const data = (await response.json()) as CloseoutResponse;
      if (!response.ok) throw new Error(data.error || "Could not save the employee pay decision.");
      setCloseoutData(data);
      setMessage(`Pay decision saved for ${employeeName}.`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the employee pay decision.");
    } finally {
      setSavingVarianceReview(null);
    }
  }

  async function saveDailyReconciliation(serviceDate: string) {
    const normalizedCountedCash = countedCashDraft.trim();
    const countedCash = Number(normalizedCountedCash);
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalizedCountedCash) ||
        !Number.isSafeInteger(Math.round(countedCash * 100)) ||
        Math.round(countedCash * 100) > 2_147_483_647) {
      setError("Enter a counted cash amount with no more than two decimal places.");
      return;
    }
    if (reconciliationNoteDraft.trim().length > 1000) {
      setError("Keep the reconciliation note to 1,000 characters or fewer.");
      return;
    }
    setSavingReconciliation(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/payroll/mobile-grooming/reconciliation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          serviceDate,
          employeeName: reconciliationEmployee,
          countedCashCents: Math.round(countedCash * 100),
          note: reconciliationNoteDraft.trim(),
        }),
      });
      const data = (await response.json()) as { reconciliation?: DailyReconciliation; error?: string };
      if (!response.ok || !data.reconciliation) {
        throw new Error(data.error || "Could not save the reconciliation.");
      }
      setReconciliations((current) => [
        ...current.filter((record) =>
          record.serviceDate !== serviceDate ||
          record.employeeName.toLocaleLowerCase() !== reconciliationEmployee.toLocaleLowerCase()
        ),
        data.reconciliation!,
      ]);
      setOpenReconciliationDay(null);
      setMessage("Daily reconciliation saved.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not save the reconciliation.");
    } finally {
      setSavingReconciliation(false);
    }
  }

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
    if (view === "reconciliation") {
      setCloseoutStep("idle");
      setReconciliationView("employee");
      setReconciliationEmployee("");
      setOpenReconciliationDay(null);
      void loadWeek(currentMobileWeekStart, "mobile-grooming");
      return;
    }
    if (view === "changes") {
      setWeekStart(currentMobileWeekStart);
      return;
    }
    if (view === "report") {
      setReportYear(dateFromParam(weekEnd).getUTCFullYear());
    }
    if (isMobileGrooming) {
      void loadMobileSummary(weekStart, view === "employee" ? selectedMobileEmployee : "");
    }
  }

  function selectReportYear(year: number) {
    setReportYear(year);
    const newestWeek = completedPayrollWeeksForYear(year, "mobile-grooming")[0];
    if (newestWeek) {
      void loadWeek(newestWeek.weekStart, "mobile-grooming");
    }
  }

  function printMobileWeeklyReport() {
    const originalTitle = document.title;
    const restoreTitle = () => {
      document.title = originalTitle;
      window.removeEventListener("afterprint", restoreTitle);
    };

    document.title = `Planet Pooch Mobile Grooming Weekly Report - ${formatWeekRange(
      weekStart,
      weekEnd
    )}`;
    window.addEventListener("afterprint", restoreTitle, { once: true });
    window.print();
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
    <div
      className={cn(
        "space-y-5",
        loading && "opacity-70",
        mobilePayrollView === "report" && "pp-mobile-weekly-report-active",
        printingPaystubs && "pp-mobile-paystubs-active"
      )}
    >
      <PayrollSubnav active={business} />

      {isMobileGrooming && (
        <div>
          <p className="mb-1 text-sm font-medium text-gray-700">View</p>
          <div className="pp-tabs" role="tablist" aria-label="Mobile grooming payroll view">
            {(["summary", "employee", "report", "reconciliation", "changes"] as const).map((view) => {
              const active = mobilePayrollView === view;
              const label =
                view === "summary"
                  ? "All Staff"
                  : view === "employee"
                    ? "By Employee"
                    : view === "report"
                      ? "Weekly Report"
                      : view === "reconciliation" ? "Reconciliation" : "After Payout";
              return (
                <button
                  key={view}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={cn("pp-tab", active && "is-on")}
                  onClick={() => selectMobilePayrollView(view)}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {isMobileGrooming && mobilePayrollView === "reconciliation"
              ? reconciliationView === "employee" ? "Daily Reconciliation"
                : reconciliationView === "weekly" ? "Weekly Reconciliation" : "Payouts"
              : isMobileGrooming && mobilePayrollView === "changes" ? "Changes After Payout"
              : "Payroll"}
          </h2>
          <p className="mt-1 text-gray-500">
            {isMobileGrooming && mobilePayrollView === "changes"
              ? "Changes to groomer pay after a week was paid out"
              : <>{isMobileGrooming ? "Weekly mobile grooming appointments" : "Weekly staff hours"} ({payPeriod.rangeLabel})</>}
          </p>
        </div>
        {!isMobileGrooming ? (
          <Button type="button" onClick={() => setShowMoegoImport((open) => !open)}>
            {showMoegoImport ? "Hide MoeGo import" : "Import from MoeGo"}
          </Button>
        ) : null}
      </div>

      {isMobileGrooming && mobilePayrollView === "reconciliation" && (
        <div className="pp-tabs" role="tablist" aria-label="Reconciliation view">
          {(["employee", "weekly", "payouts"] as const).map((view) => (
            <button
              key={view}
              type="button"
              role="tab"
              aria-selected={reconciliationView === view}
              className={cn("pp-tab", reconciliationView === view && "is-on")}
              onClick={() => {
                setReconciliationView(view);
                setOpenReconciliationDay(null);
                setDepositEditEmployee(null);
                setAdjustmentEditEmployee(null);
              }}
            >
              {view === "employee" ? "Employee" : view === "weekly" ? "Weekly" : "Payouts"}
            </button>
          ))}
        </div>
      )}

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

      {isMobileGrooming && mobilePayrollView !== "report" && mobilePayrollView !== "reconciliation" && mobilePayrollView !== "changes" && (
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

      {isMobileGrooming && mobilePayrollView === "reconciliation" && (
        <Card>
          <CardContent className="space-y-5">
            <div className={cn("grid gap-3", reconciliationView === "employee" && "md:grid-cols-2")}>
              <Select
                id="reconciliation-week"
                label="Week"
                value={weekStart}
                onChange={(event) => {
                  setCloseoutStep("idle");
                  setReconciliationEmployee("");
                  setOpenReconciliationDay(null);
                  setDepositEditEmployee(null);
                  setAdjustmentEditEmployee(null);
                  void loadWeek(event.target.value, "mobile-grooming");
                }}
                disabled={loading}
              >
                {reconciliationWeeks.map((week) => (
                  <option key={week.weekStart} value={week.weekStart}>
                    {formatWeekRange(week.weekStart, week.weekEnd)}
                  </option>
                ))}
              </Select>
              {reconciliationView === "employee" && (
                <Select
                  id="reconciliation-employee"
                  label="Employee"
                  value={reconciliationEmployee}
                  onChange={(event) => {
                    setReconciliationEmployee(event.target.value);
                    setOpenReconciliationDay(null);
                  }}
                  disabled={loading || !weekStart}
                >
                  <option value="">Select employee</option>
                  {employeeOptions.map((employee) => (
                    <option key={employee.id} value={normalizeEmployeeName(employee.name)}>
                      {normalizeEmployeeName(employee.name)}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            {reconciliationView === "payouts" ? (
              loading || loadingDirectDeposits || !closeoutData ? (
                <p className="text-sm text-gray-500">Loading payouts and closeout...</p>
              ) : closeoutData.preview.payouts.length === 0 ? (
                <p className="text-sm text-gray-500">No saved mobile grooming appointments or weekly base pay for this week.</p>
              ) : (
                <div className="space-y-6">
                  <div>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-lg font-semibold text-gray-900">Employee payouts</h3>
                      <Button type="button" variant="secondary" onClick={() => setPrintingPaystubs(true)}>
                        Print paystubs
                      </Button>
                    </div>
                    <p className="mb-3 text-sm text-gray-600">
                      Earned pay includes commission, credit card tips, and any weekly base pay shown below. Pay from closed weeks is carried separately. Cash payout = earned pay + prior-week correction − direct deposit + adjustment + any reviewed weekly over/short applied.
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-gray-200">
                      <Table>
                        <TableHead>
                          <TableRow>
                            <TableHeader>Employee</TableHeader>
                            <TableHeader>Base Pay</TableHeader>
                            <TableHeader>Earned Pay</TableHeader>
                            <TableHeader>Prior-week correction</TableHeader>
                            <TableHeader>Direct Deposit</TableHeader>
                            <TableHeader>Adjustment</TableHeader>
                            <TableHeader>Weekly over/short applied</TableHeader>
                            <TableHeader>Cash Payout</TableHeader>
                            <TableHeader>Pay Prepared</TableHeader>
                            <TableHeader>Paid Pay Lock</TableHeader>
                            <TableHeader>Details</TableHeader>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {closeoutData.preview.payouts.map((payout) => (
                            <TableRow key={payout.employeeName}>
                              <TableCell className="font-medium">{payout.employeeName}</TableCell>
                              <TableCell>
                                {payout.payKind === "fixed" ? `${formatMoney(payout.basePayCents / 100)} fixed`
                                  : payout.payKind === "additive" ? `${formatMoney(payout.basePayCents / 100)} added`
                                  : "—"}
                              </TableCell>
                              <TableCell>{formatMoney(payout.groomerPayCents / 100)}</TableCell>
                              <TableCell className={payout.priorPeriodAdjustmentCents < 0 ? "text-red-700" : payout.priorPeriodAdjustmentCents > 0 ? "text-green-700" : ""}>{formatSignedMoney(payout.priorPeriodAdjustmentCents)}</TableCell>
                              <TableCell>
                                {depositEditEmployee === payout.employeeName ? (
                                  <div className="flex min-w-56 items-end gap-2">
                                    <div className="w-32">
                                      <Input
                                        label={`Direct deposit for ${payout.employeeName}`}
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={depositDraft}
                                        onChange={(event) => setDepositDraft(event.target.value)}
                                        disabled={savingDirectDeposit}
                                      />
                                    </div>
                                    <Button type="button" size="sm" onClick={() => void saveDirectDeposit(payout.employeeName)} disabled={savingDirectDeposit}>
                                      {savingDirectDeposit ? "Saving..." : "Save"}
                                    </Button>
                                    <Button type="button" size="sm" variant="secondary" onClick={() => setDepositEditEmployee(null)} disabled={savingDirectDeposit}>
                                      Cancel
                                    </Button>
                                  </div>
                                ) : (
                                  <span>
                                    {formatMoney(payout.directDepositCents / 100)}
                                    {!payout.directDepositSet && <span className="ml-2 text-xs text-amber-700">Not set</span>}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {adjustmentEditEmployee === payout.employeeName ? (
                                  <div className="w-56 space-y-2">
                                    <Input
                                      label={`Adjustment (+/-) for ${payout.employeeName}`}
                                      type="number"
                                      step="0.01"
                                      value={adjustmentDraft}
                                      onChange={(event) => setAdjustmentDraft(event.target.value)}
                                      disabled={savingAdjustment}
                                    />
                                    <div>
                                      <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={`adjustment-note-${payout.employeeName.replace(/[^a-z0-9]/gi, "-")}`}>
                                        Adjustment note
                                      </label>
                                      <textarea
                                        id={`adjustment-note-${payout.employeeName.replace(/[^a-z0-9]/gi, "-")}`}
                                        value={adjustmentNoteDraft}
                                        onChange={(event) => setAdjustmentNoteDraft(event.target.value)}
                                        maxLength={1000}
                                        rows={2}
                                        disabled={savingAdjustment}
                                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                                      />
                                    </div>
                                    <div className="flex gap-2">
                                      <Button type="button" size="sm" onClick={() => void saveAdjustment(payout.employeeName)} disabled={savingAdjustment}>
                                        {savingAdjustment ? "Saving..." : "Save adjustment"}
                                      </Button>
                                      <Button type="button" size="sm" variant="secondary" onClick={() => setAdjustmentEditEmployee(null)} disabled={savingAdjustment}>
                                        Cancel
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="min-w-40 space-y-1">
                                    <span className={cn("font-medium", payout.adjustmentCents < 0 && "text-red-700", payout.adjustmentCents > 0 && "text-green-700")}>
                                      {formatSignedMoney(payout.adjustmentCents)}
                                    </span>
                                    {payout.adjustmentNote && <p className="max-w-60 whitespace-pre-wrap break-words text-xs text-gray-600">{payout.adjustmentNote}</p>}
                                    <Button type="button" size="sm" variant="secondary" onClick={() => {
                                      setDepositEditEmployee(null);
                                      setAdjustmentEditEmployee(payout.employeeName);
                                      setAdjustmentDraft((payout.adjustmentCents / 100).toFixed(2));
                                      setAdjustmentNoteDraft(payout.adjustmentNote);
                                    }}>
                                      {payout.adjustmentCents === 0 ? "Add adjustment" : "Edit adjustment"}
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                              <TableCell>
                                {payout.varianceReviewed ? formatSignedMoney(payout.variancePayoutCents) : "Review pending"}
                              </TableCell>
                              <TableCell className={payout.cashPayoutCents < 0 ? "font-medium text-red-700" : "font-medium"}>
                                {payout.directDepositSet ? formatMoney(payout.cashPayoutCents / 100) : "Pending"}
                              </TableCell>
                              <TableCell>
                                <label className="inline-flex items-center gap-2 whitespace-nowrap text-sm">
                                  <input
                                    type="checkbox"
                                    checked={payout.payPrepared}
                                    onChange={(event) => void savePayPreparation(payout.employeeName, event.target.checked)}
                                    disabled={Boolean(savingPayPreparation) || loadingDirectDeposits || Boolean(payout.payLock)}
                                    aria-label={`Pay prepared for ${payout.employeeName}`}
                                    className="h-4 w-4 accent-[#315d64]"
                                  />
                                  {payout.payPrepared ? "Prepared" : "Pending"}
                                </label>
                              </TableCell>
                              <TableCell>
                                {payout.payLock ? (
                                  <div className="min-w-32 text-sm">
                                    <p className="font-semibold text-green-800">Locked {formatMoney(payout.payLock.weeklyPayCents / 100)}</p>
                                    <p className="text-xs text-gray-600">Cash paid: {formatMoney(payout.payLock.cashPayoutCents / 100)}</p>
                                    <p className="text-xs text-gray-500">{new Date(payout.payLock.lockedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</p>
                                  </div>
                                ) : (
                                  <Button type="button" size="sm" variant="secondary"
                                    onClick={() => void lockEmployeePay(payout.employeeName)}
                                    disabled={Boolean(savingPayLock) || !closeoutData.closeout &&
                                      (!payout.payPrepared || !payout.directDepositSet || !payout.varianceReviewed || payout.cashPayoutCents < 0)}>
                                    {savingPayLock === payout.employeeName ? "Locking..." : "Lock in paid pay"}
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>
                                {depositEditEmployee !== payout.employeeName && (
                                  <Button type="button" size="sm" variant="secondary" onClick={() => {
                                    setAdjustmentEditEmployee(null);
                                    setDepositEditEmployee(payout.employeeName);
                                    setDepositDraft(payout.directDepositSet ? (payout.directDepositCents / 100).toFixed(2) : "");
                                  }}>
                                    {payout.directDepositSet ? "Edit" : "Set amount"}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                          <TableRow>
                            <TableCell className="font-semibold">Total</TableCell>
                            <TableCell className="font-semibold">{formatMoney(closeoutData.preview.payouts.reduce((sum, payout) => sum + payout.basePayCents, 0) / 100)}</TableCell>
                            <TableCell className="font-semibold">{formatMoney(closeoutData.preview.payouts.reduce((sum, payout) => sum + payout.groomerPayCents, 0) / 100)}</TableCell>
                            <TableCell className="font-semibold">{formatSignedMoney(closeoutData.preview.payouts.reduce((sum, payout) => sum + payout.priorPeriodAdjustmentCents, 0))}</TableCell>
                            <TableCell className="font-semibold">{closeoutData.preview.missingDepositSettings.length === 0
                              ? formatMoney(closeoutData.preview.payouts.reduce((sum, payout) => sum + payout.directDepositCents, 0) / 100)
                              : "Pending"}</TableCell>
                            <TableCell className="font-semibold">{formatSignedMoney(closeoutData.preview.adjustmentCents)}</TableCell>
                            <TableCell className="font-semibold">{formatSignedMoney(closeoutData.preview.payouts.reduce((sum, payout) => sum + payout.variancePayoutCents, 0))}</TableCell>
                            <TableCell className="font-semibold">{closeoutData.preview.missingDepositSettings.length === 0
                              ? formatMoney(closeoutData.preview.cashPayoutCents / 100) : "Pending"}</TableCell>
                            <TableCell className="font-semibold">{closeoutData.preview.payouts.filter((payout) => payout.payPrepared).length}/{closeoutData.preview.payouts.length}</TableCell>
                            <TableCell className="font-semibold">{closeoutData.preview.payouts.filter((payout) => payout.payLock).length}/{closeoutData.preview.payouts.length}</TableCell>
                            <TableCell />
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-lg border border-gray-200 p-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Cash deposit</h3>
                      <p className="text-sm text-gray-600">Cash collected from daily reconciliation minus employee cash payouts.</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <WeeklyMetric label="Cash collected" value={formatMoney(closeoutData.preview.countedCashCents / 100)} />
                      <WeeklyMetric label="Cash payouts" value={closeoutData.preview.missingDepositSettings.length === 0 && closeoutData.preview.pendingVarianceReviews.length === 0
                        ? formatMoney(closeoutData.preview.cashPayoutCents / 100) : "Pending"} />
                      <WeeklyMetric label="Cash deposit" value={closeoutData.preview.missingDays.length === 0 && closeoutData.preview.staleDays.length === 0 &&
                        closeoutData.preview.missingDepositSettings.length === 0 && closeoutData.preview.pendingVarianceReviews.length === 0 &&
                        closeoutData.preview.negativeCashPayouts.length === 0 && closeoutData.preview.expectedDepositCents >= 0
                        ? formatMoney(closeoutData.preview.expectedDepositCents / 100) : "Pending"} />
                    </div>
                    {(closeoutData.preview.missingDays.length > 0 || closeoutData.preview.staleDays.length > 0) && (
                      <p className="text-sm text-amber-700">Cash collected reflects reconciled days so far. Complete daily reconciliation to calculate the deposit.</p>
                    )}
                    {(closeoutData.preview.missingDepositSettings.length > 0 || closeoutData.preview.pendingVarianceReviews.length > 0 ||
                      closeoutData.preview.negativeCashPayouts.length > 0 || closeoutData.preview.expectedDepositCents < 0) && (
                      <p className="text-sm text-amber-700">Set direct deposits, review weekly variances, and resolve invalid payouts to calculate the deposit.</p>
                    )}
                  </div>
                </div>
              )
            ) : reconciliationView === "weekly" ? (
              loading || loadingReconciliations ? (
                <p className="text-sm text-gray-500">Loading weekly reconciliation...</p>
              ) : allEmployeeReconciliationGroups.length === 0 ? (
                <p className="text-sm text-gray-500">No saved mobile grooming appointments for this week.</p>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <WeeklyMetric label="Weekly cash (expected)" value={formatMoney(allEmployeeExpectedCash)} />
                    <WeeklyMetric label="Weekly cash (counted)" value={formatMoney(allEmployeeCountedCashCents / 100)} />
                    <WeeklyMetric
                      label="Weekly over / short"
                      value={allEmployeeReconciledDays > 0
                        ? formatCashDifference(allEmployeeDifferenceCents)
                        : "Pending"}
                    />
                  </div>
                  <p className="text-sm text-gray-600">
                    {allEmployeeReconciledDays} of {allEmployeeWorkedDays} employee days reconciled
                    {allEmployeeReconciledDays === allEmployeeWorkedDays && allEmployeeStaleDays === 0
                      ? " · Week reconciled."
                      : ". Counted cash and over / short include reconciled days only."}
                    {allEmployeeStaleDays > 0 &&
                      ` ${allEmployeeStaleDays} day${allEmployeeStaleDays === 1 ? "" : "s"} need an update after payroll changed.`}
                  </p>
                  {loadingDirectDeposits || !closeoutData ? (
                    <p className="text-sm text-gray-500">Loading final weekly reconciliation...</p>
                  ) : (
                    <div className="space-y-4 rounded-lg border border-gray-200 p-4">
                      {closeoutData.closeoutCurrent && closeoutStep === "idle" ? (
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold text-green-800">Weekly reconciliation completed</p>
                            <p className="text-sm text-gray-600">
                              {formatMoney(closeoutData.closeout!.finalDepositCents / 100)} deposited · {formatCashDifference(closeoutData.closeout!.varianceCents)}
                            </p>
                          </div>
                          <Button type="button" variant="secondary" onClick={() => setCloseoutStep("days")}>Review closeout</Button>
                        </div>
                      ) : closeoutStep === "idle" ? (
                        <div className="flex flex-wrap items-center gap-3">
                          <Button type="button" onClick={() => setCloseoutStep("days")}>Begin Reconciliation</Button>
                          {closeoutData.closeout && <span className="text-sm text-amber-700">Previous closeout needs updating</span>}
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <h3 className="text-lg font-semibold text-gray-900">Final weekly reconciliation</h3>
                            <Button type="button" size="sm" variant="secondary" onClick={() => setCloseoutStep("idle")}>Collapse</Button>
                          </div>
                          {closeoutStep === "days" && (
                            <div className="space-y-3">
                              <p className="font-medium">1. Review employee days</p>
                              <p className="text-sm text-gray-600">
                                {closeoutData.preview.reconciledDays} of {closeoutData.preview.workedDays} employee days complete.
                              </p>
                              {[...closeoutData.preview.missingDays, ...closeoutData.preview.staleDays].map((day) => (
                                <div key={day} className="flex items-center justify-between gap-3 rounded-md border border-amber-200 p-3 text-sm">
                                  <span>{day} · {closeoutData.preview.staleDays.includes(day) ? "Needs update" : "Pending"}</span>
                                  <Button type="button" size="sm" variant="secondary" onClick={() => {
                                    setReconciliationEmployee(day.split(" — ")[0]);
                                    setReconciliationView("employee");
                                  }}>Review day</Button>
                                </div>
                              ))}
                              {closeoutData.preview.missingDays.length === 0 && closeoutData.preview.staleDays.length === 0 && (
                                <p className="text-sm text-green-700">Every employee day is complete and current.</p>
                              )}
                              <Button type="button" onClick={() => setCloseoutStep("employees")} disabled={
                                closeoutData.preview.missingDays.length > 0 || closeoutData.preview.staleDays.length > 0
                              }>Continue to employees</Button>
                            </div>
                          )}
                          {closeoutStep === "employees" && (
                            <div className="space-y-3">
                              <p className="font-medium">2. Review each employee’s over or short amount</p>
                              <p className="text-sm text-gray-600">Choose whether each overage or shortage changes this week’s cash payout. Weekly pay remains unchanged.</p>
                              {closeoutData.preview.payouts.map((payout) => {
                                const shortageDays = reconciliations.filter((record) =>
                                  record.employeeName.toLocaleLowerCase() === payout.employeeName.toLocaleLowerCase() &&
                                  record.countedCashCents < record.expectedCashCents
                                ).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
                                return (
                                <div key={payout.employeeName} className={cn(
                                  "rounded-md border p-3 transition-colors",
                                  payout.varianceReviewed ? "border-green-300 bg-green-50/60" : "border-gray-200 bg-white"
                                )}>
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <span className="font-medium">{payout.employeeName}</span>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span>{formatCashDifference(payout.varianceCents)}</span>
                                      {payout.varianceReviewed && (
                                        <span className="rounded-full border border-green-200 bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
                                          {payout.hasWorkedDays ? "✓ Reviewed" : "No cash days"}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <p className={cn("mt-1 text-xs", payout.varianceReviewed ? "text-green-800" : "text-gray-600")}>
                                    {payout.varianceReviewed ? payout.applyVarianceToCashPayout
                                      ? "Applied to cash payout" : "Not applied to cash payout" : "Review required"}
                                  </p>
                                  {shortageDays.length > 0 && (
                                    <div className="mt-3 space-y-2 rounded-md bg-amber-50 p-3 text-sm">
                                      <p className="font-medium text-amber-900">Shortage notes</p>
                                      {shortageDays.map((record) => (
                                        <div key={record.serviceDate}>
                                          <p className="font-medium text-gray-800">
                                            {dateFromParam(record.serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" })}
                                            {` · ${formatCashDifference(record.countedCashCents - record.expectedCashCents)}`}
                                          </p>
                                          <p className="whitespace-pre-wrap break-words text-gray-700">{record.note.trim() || "No note saved for this day."}</p>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {(!payout.varianceReviewed || payout.varianceCents !== 0) && (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {payout.varianceCents !== 0 && (
                                        <Button type="button" size="sm" variant={payout.applyVarianceToCashPayout === true ? "primary" : "secondary"}
                                          disabled={Boolean(savingVarianceReview)} onClick={() => void saveVarianceReview(payout.employeeName, true)}>
                                          {payout.varianceCents < 0 ? "Apply shortage to cash payout" : "Add overage to cash payout"}
                                        </Button>
                                      )}
                                      <Button type="button" size="sm" variant={payout.applyVarianceToCashPayout === false ? "primary" : "secondary"}
                                        disabled={Boolean(savingVarianceReview)} onClick={() => void saveVarianceReview(payout.employeeName, false)}>
                                        {payout.varianceCents < 0 ? "Do not apply shortage"
                                          : payout.varianceCents === 0 ? "Mark reviewed" : "Do not add to payout"}
                                      </Button>
                                    </div>
                                  )}
                                </div>
                                );
                              })}
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="secondary" onClick={() => setCloseoutStep("days")}>Back to days</Button>
                                <Button type="button" onClick={() => setCloseoutStep("deposit")} disabled={closeoutData.preview.pendingVarianceReviews.length > 0}>
                                  Continue to final cash
                                </Button>
                              </div>
                              {closeoutData.preview.pendingVarianceReviews.length > 0 && (
                                <p className="text-sm text-amber-700">Review all {closeoutData.preview.pendingVarianceReviews.length} remaining employees to continue.</p>
                              )}
                            </div>
                          )}
                          {closeoutStep === "deposit" && (
                            <div className="space-y-4">
                              <p className="font-medium">3. Enter the final cash deposited</p>
                              <div className="grid gap-3 sm:grid-cols-3">
                                <WeeklyMetric label="Counted client cash" value={formatMoney(closeoutData.preview.countedCashCents / 100)} />
                                <WeeklyMetric label="Cash payouts" value={formatMoney(closeoutData.preview.cashPayoutCents / 100)} />
                                <WeeklyMetric label="Expected deposit" value={formatMoney(closeoutData.preview.expectedDepositCents / 100)} />
                              </div>
                              {closeoutData.preview.missingDepositSettings.length > 0 && (
                                <p className="text-sm text-amber-700">Set direct deposits for {closeoutData.preview.missingDepositSettings.join(", ")} in Payouts.</p>
                              )}
                              {closeoutData.preview.negativeCashPayouts.length > 0 && (
                                <p className="text-sm text-amber-700">Resolve negative cash payouts for {closeoutData.preview.negativeCashPayouts.join(", ")}.</p>
                              )}
                              {(closeoutData.preview.missingDepositSettings.length > 0 || closeoutData.preview.negativeCashPayouts.length > 0) && (
                                <Button type="button" size="sm" variant="secondary" onClick={() => setReconciliationView("payouts")}>Open Payouts</Button>
                              )}
                              <div className="flex flex-wrap items-end gap-3">
                                <div className="w-56">
                                  <Input label="Final cash deposited" type="number" min="0" step="0.01"
                                    value={finalDepositDraft} onChange={(event) => setFinalDepositDraft(event.target.value)}
                                    disabled={savingCloseout || closeoutData.preview.missingDepositSettings.length > 0} />
                                </div>
                                <p className="pb-2 text-sm text-gray-600">
                                  Difference: {finalDepositDraft.trim() && Number.isFinite(Number(finalDepositDraft))
                                    ? formatCashDifference(Math.round(Number(finalDepositDraft) * 100) - closeoutData.preview.expectedDepositCents)
                                    : "Enter final deposit"}
                                </p>
                              </div>
                              <div>
                                <label htmlFor="closeout-note" className="mb-1 block text-sm font-medium text-gray-700">
                                  Difference note (required when final deposit differs)
                                </label>
                                <textarea id="closeout-note" value={closeoutNoteDraft}
                                  onChange={(event) => setCloseoutNoteDraft(event.target.value)} maxLength={1000}
                                  rows={2} disabled={savingCloseout}
                                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100" />
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" variant="secondary" onClick={() => setCloseoutStep("employees")}>Back to employees</Button>
                                <Button type="button" onClick={() => void saveWeeklyCloseout()} disabled={
                                  savingCloseout || !closeoutData.weekCompleted ||
                                  closeoutData.preview.missingDays.length > 0 || closeoutData.preview.staleDays.length > 0 ||
                                  closeoutData.preview.pendingVarianceReviews.length > 0 ||
                                  closeoutData.preview.missingDepositSettings.length > 0 ||
                                  closeoutData.preview.negativeCashPayouts.length > 0 || closeoutData.preview.expectedDepositCents < 0
                                }>{savingCloseout ? "Saving..." : "Complete week"}</Button>
                              </div>
                              {!closeoutData.weekCompleted && <p className="text-sm text-amber-700">The week must end before it can be closed.</p>}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <Table>
                      <TableHead>
                        <TableRow>
                          <TableHeader>Employee</TableHeader>
                          <TableHeader>Days</TableHeader>
                          <TableHeader>Expected cash</TableHeader>
                          <TableHeader>Counted cash</TableHeader>
                          <TableHeader>Over / short</TableHeader>
                          <TableHeader>Status</TableHeader>
                          <TableHeader>Details</TableHeader>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {allEmployeeReconciliationGroups.map((group) => (
                          <TableRow key={group.employeeName}>
                            <TableCell className="font-medium">{group.employeeName}</TableCell>
                            <TableCell>{group.reconciledDays} / {group.workedDays}</TableCell>
                            <TableCell>{formatMoney(group.expectedCash)}</TableCell>
                            <TableCell>{formatMoney(group.countedCashCents / 100)}</TableCell>
                            <TableCell>{group.reconciledDays > 0
                              ? formatCashDifference(group.differenceCents)
                              : "Pending"}</TableCell>
                            <TableCell>{group.staleDays > 0
                              ? "Needs update"
                              : group.reconciledDays === group.workedDays
                                ? "Reconciled"
                                : "Pending"}</TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setReconciliationEmployee(group.employeeName);
                                  setReconciliationView("employee");
                                }}
                              >
                                Review
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )
            ) : !reconciliationEmployee ? (
              <p className="text-sm text-gray-500">Choose a week and employee to view days worked.</p>
            ) : loading || loadingReconciliations ? (
              <p className="text-sm text-gray-500">Loading days worked...</p>
            ) : reconciliationDays.length === 0 ? (
              <p className="text-sm text-gray-500">No saved appointments for this employee and week.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-3">
                  <WeeklyMetric
                    label="Weekly cash (expected)"
                    value={formatMoney(reconciliationWeeklyExpectedCash)}
                  />
                  <WeeklyMetric
                    label="Weekly cash (counted)"
                    value={formatMoney(reconciliationWeeklyCountedCashCents / 100)}
                  />
                  <WeeklyMetric
                    label="Weekly over / short"
                    value={reconciliationWeeklyRecords.length > 0
                      ? formatCashDifference(reconciliationWeeklyDifferenceCents)
                      : "Pending"}
                  />
                </div>
                <p className="text-sm text-gray-600">
                  {reconciliationWeeklyRecords.length} of {reconciliationDays.length} worked days reconciled.
                  {reconciliationWeeklyRecords.length < reconciliationDays.length &&
                    " Counted cash and over / short include reconciled days only."}
                </p>
                {reconciliationDays.map((day) => {
                  const totals = mobileTotalsForEntries(day.entries);
                  const record = reconciliations.find(
                    (item) => item.serviceDate === day.value &&
                      item.employeeName.toLocaleLowerCase() === reconciliationEmployee.toLocaleLowerCase()
                  );
                  const isOpen = openReconciliationDay === day.value;
                  const differenceCents = record ? record.countedCashCents - record.expectedCashCents : 0;
                  return (
                    <div key={day.value} className="overflow-hidden rounded-lg border border-gray-200">
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-gray-50 px-4 py-3">
                        <div>
                          <h3 className="font-semibold text-gray-900">{day.label}</h3>
                          <p className="text-sm text-gray-600">
                            {totals.stops} appointments · {totals.dogs} pets ·{" "}
                            {formatMoney(totals.cash)} expected cash
                          </p>
                          {record && !isOpen && (
                            <>
                              <p className="mt-1 text-sm text-gray-700">
                                Reconciled {new Date(record.reconciledAt).toLocaleString("en-US", {
                                  timeZone: "America/New_York", month: "short", day: "numeric",
                                  year: "numeric", hour: "numeric", minute: "2-digit",
                                })}
                                {differenceCents !== 0 &&
                                  ` · ${formatMoney(record.countedCashCents / 100)} counted cash`}
                                {` · ${formatCashDifference(differenceCents)}`}
                              </p>
                              {record.expectedCashCents !== Math.round(totals.cash * 100) && (
                                <p className="text-sm text-amber-700">Cash total changed since reconciliation. Edit to refresh it.</p>
                              )}
                              {differenceCents !== 0 && record.note && (
                                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">Note: {record.note}</p>
                              )}
                            </>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => {
                            setOpenReconciliationDay(isOpen ? null : day.value);
                            setCountedCashDraft(record ? (record.countedCashCents / 100).toFixed(2) : "");
                            setReconciliationNoteDraft(record?.note ?? "");
                          }}
                        >
                          {isOpen ? "Collapse" : record ? "Edit" : "Reconcile"}
                        </Button>
                      </div>
                      {isOpen && (
                        <div className="space-y-4 px-4 py-4">
                          <MobileGroomingDailyTable entries={day.entries} />
                          <div className="flex flex-wrap items-end gap-3">
                            <div className="w-48">
                              <Input
                                label="Counted cash"
                                type="number"
                                min="0"
                                step="0.01"
                                value={countedCashDraft}
                                onChange={(event) => setCountedCashDraft(event.target.value)}
                                disabled={savingReconciliation}
                              />
                            </div>
                            <p className="pb-2 text-sm text-gray-600">Expected: {formatMoney(totals.cash)}</p>
                            <Button
                              type="button"
                              onClick={() => void saveDailyReconciliation(day.value)}
                              disabled={savingReconciliation}
                            >
                              {savingReconciliation ? "Saving..." : "Save reconciliation"}
                            </Button>
                          </div>
                          <div>
                            <label htmlFor="reconciliation-note" className="mb-1 block text-sm font-medium text-gray-700">
                              Reason for over / short (optional)
                            </label>
                            <textarea
                              id="reconciliation-note"
                              value={reconciliationNoteDraft}
                              onChange={(event) => setReconciliationNoteDraft(event.target.value)}
                              maxLength={1000}
                              rows={3}
                              disabled={savingReconciliation}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100"
                              placeholder="Explain why the cash count differs from the expected amount"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isMobileGrooming && mobilePayrollView === "changes" && (
        <Card>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <p className="text-sm text-gray-600">Compare paid out groomer earnings with the latest saved payroll.</p>
              <div className="flex flex-wrap items-end gap-3">
                <Select id="post-payout-check-week" label="Paid out week" value={postPayoutCheckWeekStart}
                  onChange={(event) => {
                    setPostPayoutCheckWeekStart(event.target.value);
                    setPostPayoutCheckResult(null);
                  }} disabled={loadingPostPayoutCheckWeeks || checkingPostPayout || postPayoutCheckWeeks.length === 0}>
                  {postPayoutCheckWeeks.length === 0 && <option value="">No paid out weeks</option>}
                  {postPayoutCheckWeeks.map((week) => (
                    <option key={week.weekStart} value={week.weekStart}>{formatWeekRange(week.weekStart, week.weekEnd)}</option>
                  ))}
                </Select>
                <Button type="button" onClick={() => void checkPostPayoutChanges()}
                  disabled={checkingPostPayout || loadingPostPayoutCheckWeeks || !postPayoutCheckWeekStart}>
                  {checkingPostPayout ? "Checking..." : "Check paid vs actual pay"}
                </Button>
              </div>
            </div>
            {postPayoutCheckResult && <p className="text-sm text-gray-700" role="status">{postPayoutCheckResult}</p>}
            {loadingPostPayoutChanges ? (
              <p className="text-sm text-gray-500">Loading changes...</p>
            ) : !postPayoutChanges?.changes.length ? (
              <p className="text-sm text-gray-600">No changes to paid out weeks have been recorded.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <Table>
                  <TableHead><TableRow>
                    <TableHeader>Detected</TableHeader><TableHeader>Paid out week</TableHeader>
                    <TableHeader>Groomer</TableHeader><TableHeader>Paid pay</TableHeader>
                    <TableHeader>Latest earned pay</TableHeader><TableHeader>Adjustment</TableHeader>
                    <TableHeader>Pay week</TableHeader><TableHeader>Status</TableHeader>
                  </TableRow></TableHead>
                  <TableBody>{postPayoutChanges.changes.map((change) => (
                    <TableRow key={change.id}>
                      <TableCell>{new Date(change.detectedAt).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</TableCell>
                      <TableCell>{formatWeekRange(change.sourceWeekStart, change.sourceWeekEnd)}</TableCell>
                      <TableCell className="font-medium">{change.employeeName}</TableCell>
                      <TableCell>{formatMoney(change.baselinePayCents / 100)}</TableCell>
                      <TableCell>{formatMoney(change.revisedPayCents / 100)}</TableCell>
                      <TableCell>
                        <span className={change.amountCents < 0 ? "font-semibold text-red-700" : "font-semibold text-green-700"}>{formatSignedMoney(change.amountCents)}</span>
                        {change.breakdown?.length ? (
                          <details className="mt-1 min-w-56 text-xs text-gray-700">
                            <summary className="cursor-pointer font-medium text-blue-700">View adjustment details</summary>
                            <div className="mt-2 space-y-1 border-t border-gray-200 pt-2">
                              {change.breakdown.map((line) => (
                                <div key={line.reason} className="flex items-start justify-between gap-3">
                                  <span>{line.reason}</span>
                                  <span className="whitespace-nowrap tabular-nums">{formatSignedMoney(line.amountCents)}</span>
                                </div>
                              ))}
                            </div>
                          </details>
                        ) : (
                          <p className="mt-1 max-w-56 text-xs font-normal text-gray-500">
                            {change.breakdown ? "No component changes recorded." : "Details unavailable from the paid snapshot or payroll changed since this check. Recheck the paid week."}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>{formatWeekRange(change.targetWeekStart, change.targetWeekEnd)}</TableCell>
                      <TableCell>{change.targetClosedAt ? "Paid" : "Pending payout"}</TableCell>
                    </TableRow>
                  ))}</TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {mobilePayrollView !== "reconciliation" && mobilePayrollView !== "changes" && <Card className={cn(mobilePayrollView === "report" && "pp-mobile-weekly-report")}>
        <CardContent className="space-y-3">
          <div
            className={cn(
              "flex gap-3",
              mobilePayrollView === "report" && "print:hidden",
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
                  mobilePayrollView === "report"
                    ? "md:max-w-3xl md:grid-cols-[140px_minmax(260px,1fr)_auto]"
                    : showMobileAppointmentDetails
                    ? "md:max-w-3xl md:grid-cols-[minmax(220px,1fr)_auto_auto_auto]"
                    : "md:max-w-2xl md:grid-cols-[minmax(220px,1fr)_auto_auto]"
                )}
              >
                {mobilePayrollView === "report" ? (
                  <>
                    <Select
                      id="payroll-report-year"
                      label="Year"
                      value={String(reportYear)}
                      onChange={(event) => selectReportYear(Number(event.target.value))}
                      disabled={loading || saving}
                    >
                      {reportYearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </Select>
                    <Select
                      id="payroll-report-week"
                      label="Week ending"
                      value={weekStart}
                      onChange={(event) => void loadWeek(event.target.value, business)}
                      disabled={loading || saving || reportWeekOptions.length === 0}
                    >
                      {reportWeekOptions.map((option) => (
                        <option key={option.weekStart} value={option.weekStart}>
                          {formatWeekEnding(option.weekEnd)}
                        </option>
                      ))}
                    </Select>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={printMobileWeeklyReport}
                      disabled={loading || mobileWeeklyReportGroups.length === 0}
                      className="print:hidden"
                    >
                      Print / PDF
                    </Button>
                  </>
                ) : (
                  <>
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
                          {option.weekStart === addDaysParam(lastCompletedWeekStart("mobile-grooming"), 7)
                            ? " (in progress)"
                            : ""}
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
                  </>
                )}
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

          {isMobileGrooming ? mobilePayrollView === "report" ? (
            <MobileGroomingWeeklyReport
              groups={mobileWeeklyReportGroups}
              totals={selectedWeekMobileTotals}
              weekStart={weekStart}
              weekEnd={weekEnd}
            />
          ) : (
            <>
              {showMobileAppointmentMetrics ? (
                <>
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
                      expanded={showMobileAppointmentDetails ? weeklyCashOpen : undefined}
                      controls={showMobileAppointmentDetails ? "weekly-cash-breakdown" : undefined}
                      onToggle={
                        showMobileAppointmentDetails
                          ? () => setWeeklyCashOpen((open) => !open)
                          : undefined
                      }
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
                  {showMobileAppointmentDetails && weeklyCashOpen ? (
                    <div
                      id="weekly-cash-breakdown"
                      className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2"
                    >
                      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-4">
                        {weeklyCashByDay.map((day) => (
                          <div
                            key={day.value}
                            className="flex items-center justify-between gap-3 py-1 text-sm"
                          >
                            <span className="text-gray-600">{day.label}</span>
                            <span className="font-semibold tabular-nums text-gray-900">
                              {formatMoney(day.cash)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
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
                    const dayCash = dayEntries.reduce(
                      (sum, entry) =>
                        sum +
                        (entry.paymentType === "cash" ? mobileEntryTotalPrice(entry) : 0),
                      0
                    );
                    return (
                      <div key={day.value} className="rounded-lg border border-gray-200 bg-white">
                        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{day.label}</h3>
                            <p className="text-xs text-gray-500">
                              {dayEntries.length} appointments · {formatMoney(dayTotal)} total ·{" "}
                              {formatMoney(dayCash)} cash · {formatMoney(dayPay)} groomer pay ·{" "}
                              {formatMoney(dayTips)} cc tips
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
      </Card>}

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
      {isMobileGrooming && mobilePayrollView === "reconciliation" && reconciliationView === "payouts" && closeoutData && (
        <div className="pp-mobile-paystubs">
          {closeoutData.preview.payouts.map((payout) => {
            const group = mobileWeeklyReportGroups.find((item) =>
              item.employeeName.toLocaleLowerCase() === payout.employeeName.toLocaleLowerCase()
            );
            return (
              <MobileGroomingPaystub
                key={payout.employeeName}
                payout={payout}
                entries={group?.entries ?? []}
                reconciliations={reconciliations}
                weekStart={weekStart}
                weekEnd={weekEnd}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function MobileGroomingPaystub({
  payout,
  entries,
  reconciliations,
  weekStart,
  weekEnd,
}: {
  payout: PayoutPreview["payouts"][number];
  entries: EditableMobileGroomingEntry[];
  reconciliations: DailyReconciliation[];
  weekStart: string;
  weekEnd: string;
}) {
  const totals = mobileTotalsForEntries(entries);
  const commissionBaseCents = entries.reduce((sum, entry) => sum + Math.max(
    0,
    Math.round(moneyValue(entry.price) * 100) + Math.round(moneyValue(entry.upgradeAmount) * 100)
      - mobileEntryDogCount(entry) * 500
  ), 0);
  const creditCardTipsCents = entries.reduce((sum, entry) => sum + Math.round(moneyValue(entry.creditCardTip) * 100), 0);
  const workedDates = new Set(entries.map((entry) => entry.serviceDate));
  const appliedVarianceDays = payout.variancePayoutCents !== 0
    ? reconciliations.filter((record) =>
        record.employeeName.toLocaleLowerCase() === payout.employeeName.toLocaleLowerCase() &&
        workedDates.has(record.serviceDate) &&
        record.countedCashCents !== record.expectedCashCents
      ).sort((a, b) => a.serviceDate.localeCompare(b.serviceDate))
    : [];

  return (
    <section className="pp-mobile-paystub text-gray-900">
      <header className="flex items-end justify-between border-b-2 border-[#315d64] pb-2">
        <div>
          <p className="text-[8pt] font-bold uppercase tracking-widest text-[#315d64]">Planet Pooch · Mobile Grooming</p>
          <h1 className="text-[17pt] font-bold">Weekly Paystub</h1>
          <p className="text-[11pt] font-semibold">{payout.employeeName}</p>
        </div>
        <p className="text-right text-[9pt]">{formatWeekRange(weekStart, weekEnd)}<br />Saturday–Friday</p>
      </header>

      {(payout.priorPeriodAdjustmentCents !== 0 || payout.priorPeriodCorrections.length > 0) && (
        <div className="mt-2 break-inside-avoid rounded-md border border-[#315d64] px-3 py-2 text-[8pt]">
          <p className="font-bold">Correction from an earlier paid week included in this pay</p>
          {payout.priorPeriodCorrections.length > 0 ? payout.priorPeriodCorrections.map((correction) => (
            <div key={correction.id} className="mt-1 border-t border-gray-200 pt-1">
              <p className="flex justify-between gap-4 font-semibold">
                <span>Original week: {formatWeekRange(correction.sourceWeekStart, correction.sourceWeekEnd)}</span>
                <span>{formatSignedMoney(correction.amountCents)}</span>
              </p>
              {correction.breakdown?.length ? correction.breakdown.map((line) => (
                <p key={line.reason} className="ml-3 flex justify-between gap-4">
                  <span>{line.reason}</span>
                  <span className="whitespace-nowrap">{formatSignedMoney(line.amountCents)}</span>
                </p>
              )) : (
                <p className="ml-3 text-gray-600">Details unavailable from the paid snapshot or payroll changed since the last check.</p>
              )}
            </div>
          )) : (
            <p className="mt-0.5 flex justify-between gap-4">
              <span>Prior paid week correction</span>
              <span className="font-semibold">{formatSignedMoney(payout.priorPeriodAdjustmentCents)}</span>
            </p>
          )}
        </div>
      )}

      <div className="mt-3">
        <h2 className="mb-1 text-[10pt] font-bold">Weekly stops · cash and credit</h2>
        <table className="pp-mobile-paystub-stops w-full border-collapse text-[7pt]">
          <colgroup>
            <col style={{ width: "8%" }} /><col style={{ width: "9%" }} />
            <col style={{ width: "5%" }} /><col style={{ width: "13%" }} />
            <col style={{ width: "11%" }} /><col style={{ width: "5%" }} />
            <col style={{ width: "11%" }} /><col style={{ width: "10%" }} />
            <col style={{ width: "14%" }} /><col style={{ width: "14%" }} />
          </colgroup>
          <thead className="border-y border-gray-400 bg-gray-100 text-left">
            <tr>
              <th className="py-1">Date</th><th>Payment</th><th className="text-right">Pets</th>
              <th className="text-right">Grooming</th><th className="text-right">Upgrades</th><th className="text-right">Qty</th>
              <th className="text-right">Discount</th><th className="text-right">CC tip</th>
              <th className="text-right">Stop total</th><th className="text-right">Comm. base</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.localId} className="border-b border-gray-200">
                <td className="py-0.5">{dateFromParam(entry.serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "numeric", day: "numeric" })}</td>
                <td className="capitalize">{entry.paymentType}</td>
                <td className="text-right">{mobileEntryDogCount(entry)}</td>
                <td className="text-right">{formatMoney(mobileEntryGroomingPrice(entry))}</td>
                <td className="text-right">{formatMoney(moneyValue(entry.upgradeAmount))}</td>
                <td className="text-right">{entry.upgradeQuantity}</td>
                <td className="text-right">{formatMoney(moneyValue(entry.discount))}</td>
                <td className="text-right">{formatMoney(moneyValue(entry.creditCardTip))}</td>
                <td className="text-right">{formatMoney(mobileEntryTotalPrice(entry))}</td>
                <td className="text-right">{formatMoney(Math.max(0, mobileEntryGroomingPrice(entry) + moneyValue(entry.upgradeAmount) - mobileEntryDogCount(entry) * 5))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-gray-500 font-bold">
            <tr>
              <td className="py-1">{entries.length} stops</td><td /><td className="text-right">{totals.dogs}</td>
              <td className="text-right">{formatMoney(totals.groomingPrice)}</td>
              <td className="text-right">{formatMoney(totals.upgrades)}</td>
              <td /><td /><td className="text-right">{formatMoney(totals.creditCardTips)}</td>
              <td className="text-right">{formatMoney(totals.pricing)}</td>
              <td className="text-right">{formatMoney(commissionBaseCents / 100)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-1 text-[7pt]">
          Cash stops: {formatMoney(totals.cash)} · Credit stops: {formatMoney(totals.pricing - totals.cash)}
        </p>
      </div>

      <div className="pp-mobile-paystub-payout mt-4 border-t-2 border-[#315d64] pt-2">
        <h2 className="mb-2 text-[10pt] font-bold">Weekly payout calculation</h2>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[8pt]">
          <span>Commission base after $5 per pet</span><span className="text-right">{formatMoney(commissionBaseCents / 100)}</span>
          <span>Grooming commission (40%)</span><span className="text-right">{formatMoney(Math.round(commissionBaseCents * 0.4) / 100)}</span>
          <span>Credit card tips</span><span className="text-right">+ {formatMoney(creditCardTipsCents / 100)}</span>
          {payout.payKind && (
            <>
              <span>Weekly base pay ({payout.payKind === "fixed" ? "fixed total" : "added"})</span>
              <span className="text-right">{formatMoney(payout.basePayCents / 100)}</span>
            </>
          )}
          <span>Earned pay for this week</span><span className="text-right">{formatMoney(payout.groomerPayCents / 100)}</span>
          {(payout.priorPeriodAdjustmentCents !== 0 || payout.priorPeriodCorrections.length > 0) && <>
            <span>Correction from closed week(s)</span><span className="text-right">{formatSignedMoney(payout.priorPeriodAdjustmentCents)}</span>
          </>}
          <span className="font-semibold">Pay this week</span><span className="text-right font-semibold">{formatMoney(payout.weeklyPayCents / 100)}</span>
          <span>Direct deposit</span><span className="text-right">{payout.directDepositSet ? `− ${formatMoney(payout.directDepositCents / 100)}` : "Not set"}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-gray-400 pt-1 text-[9pt] font-bold">
          <span>Pay this week − direct deposit</span>
          <span>{payout.directDepositSet ? formatMoney((payout.weeklyPayCents - payout.directDepositCents) / 100) : "Pending direct deposit"}</span>
        </div>
        {(payout.adjustmentCents !== 0 || appliedVarianceDays.length > 0) && (
          <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-[8pt]">
            {payout.adjustmentCents !== 0 && (
              <>
                <span className="whitespace-pre-wrap break-words">
                  Adjustment · {payout.adjustmentDate
                    ? new Date(payout.adjustmentDate).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" })
                    : "Date unavailable"} · {payout.adjustmentNote}
                </span>
                <span className="text-right">{formatSignedMoney(payout.adjustmentCents)}</span>
              </>
            )}
            {appliedVarianceDays.map((record) => (
              <Fragment key={record.serviceDate}>
                <span className="whitespace-pre-wrap break-words">
                  Cash over/short · {dateFromParam(record.serviceDate).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" })} · {record.note.trim() || "No note saved"}
                </span>
                <span className="text-right">{formatSignedMoney(record.countedCashCents - record.expectedCashCents)}</span>
              </Fragment>
            ))}
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-gray-400 pt-2 text-[12pt] font-bold">
          <span>Cash payout</span><span>{payout.directDepositSet ? formatMoney(payout.cashPayoutCents / 100) : "Pending direct deposit"}</span>
        </div>
      </div>
    </section>
  );
}

function MobileGroomingDailyTable({ entries }: { entries: EditableMobileGroomingEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
        No saved appointments for this employee and day. Pull and save the week from All Staff if needed.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-3 py-2">Payment</th>
            <th className="px-3 py-2 text-right">Pets</th>
            <th className="px-3 py-2 text-right">Grooming</th>
            <th className="px-3 py-2 text-right">Upgrades</th>
            <th className="px-3 py-2 text-right">CC Tip</th>
            <th className="px-3 py-2 text-right">Discount</th>
            <th className="px-3 py-2 text-right">Revenue</th>
            <th className="px-3 py-2 text-right">Groomer Pay</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <tr key={entry.localId}>
              <td className="px-3 py-2 capitalize">{entry.paymentType}</td>
              <td className="px-3 py-2 text-right tabular-nums">{mobileEntryDogCount(entry)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(mobileEntryGroomingPrice(entry))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(moneyValue(entry.upgradeAmount))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(moneyValue(entry.creditCardTip))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(moneyValue(entry.discount))}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatMoney(mobileEntryTotalPrice(entry))}</td>
              <td className="px-3 py-2 text-right tabular-nums">{formatMoney(mobileEntryGroomerPay(entry))}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function MobileGroomingWeeklyReport({
  groups,
  totals,
  weekStart,
  weekEnd,
}: {
  groups: Array<{
    employeeName: string;
    entries: EditableMobileGroomingEntry[];
    totals: ReturnType<typeof mobileTotalsForEntries>;
  }>;
  totals: ReturnType<typeof mobileTotalsForEntries>;
  weekStart: string;
  weekEnd: string;
}) {
  return (
    <div className="space-y-4 text-gray-900">
      <header className="hidden border-b-2 border-[#315d64] pb-3 print:flex print:items-end print:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-[#315d64]">
            Planet Pooch
          </p>
          <h1 className="mt-1 text-2xl font-bold">Mobile Grooming Weekly Report</h1>
        </div>
        <p className="text-sm font-semibold">{formatWeekRange(weekStart, weekEnd)}</p>
      </header>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        <WeeklyMetric label="Total Revenue" value={formatMoney(totals.pricing)} />
        <WeeklyMetric label="Appointments" value={String(totals.stops)} />
        <WeeklyMetric label="Pets" value={String(totals.dogs)} />
        <WeeklyMetric label="Grooming Price" value={formatMoney(totals.groomingPrice)} />
        <WeeklyMetric label="Cash Total" value={formatMoney(totals.cash)} />
        <WeeklyMetric label="CC Tips" value={formatMoney(totals.creditCardTips)} />
        <WeeklyMetric label="Groomer Pay" value={formatMoney(totals.groomerPay)} />
        <WeeklyMetric label="Upgrades ($)" value={formatMoney(totals.upgrades)} />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">
          No saved mobile grooming appointments for this week.
        </p>
      ) : (
        <div className="space-y-5 print:space-y-3">
          {groups.map((group) => {
            const dates = Array.from(new Set(group.entries.map((entry) => entry.serviceDate))).sort();
            const cashByDay = Array.from({ length: 7 }, (_, index) => {
              const date = addDaysParam(weekStart, index);
              const cash = group.entries
                .filter((entry) => entry.serviceDate === date && entry.paymentType === "cash")
                .reduce((sum, entry) => sum + mobileEntryTotalPrice(entry), 0);
              return { date, cash };
            });
            return (
              <section
                key={group.employeeName}
                className="pp-mobile-weekly-report-employee overflow-hidden rounded-lg border border-gray-200 bg-white"
              >
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-3 print:px-2 print:py-2">
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <h3 className="text-base font-semibold">{group.employeeName}</h3>
                    <p className="text-xs text-gray-600">
                      {group.totals.stops} appointments · {group.totals.dogs} pets ·{" "}
                      <span className="font-semibold text-gray-900">
                        {formatMoney(group.totals.pricing)} revenue
                      </span>{" "}
                      · {formatMoney(group.totals.groomerPay)} groomer pay
                    </p>
                  </div>
                </div>

                <div className="border-b border-gray-200 px-4 py-3 print:px-2 print:py-2">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-600">
                    Cash Reconciliation
                  </h4>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
                    {cashByDay.map((day) => (
                      <div
                        key={day.date}
                        className="flex items-center justify-between gap-3 rounded-md bg-gray-50 px-3 py-2 text-xs"
                      >
                        <span className="text-gray-600">
                          {dateFromParam(day.date).toLocaleDateString("en-US", {
                            timeZone: "UTC",
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="font-semibold tabular-nums text-gray-900">
                          {formatMoney(day.cash)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {dates.map((date) => {
                  const entries = group.entries.filter((entry) => entry.serviceDate === date);
                  const dayTotals = mobileTotalsForEntries(entries);
                  return (
                    <div key={date} className="border-b border-gray-100 last:border-b-0">
                      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-xs print:px-2">
                        <h4 className="font-semibold">
                          {dateFromParam(date).toLocaleDateString("en-US", {
                            timeZone: "UTC",
                            weekday: "long",
                            month: "short",
                            day: "numeric",
                          })}
                        </h4>
                        <span className="text-gray-600">
                          {entries.length} appointments · {formatMoney(dayTotals.pricing)} revenue ·{" "}
                          {formatMoney(dayTotals.cash)} cash
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-xs">
                          <thead className="bg-gray-50 text-[10px] uppercase tracking-[0.05em] text-gray-500">
                            <tr>
                              <th className="px-3 py-1.5">Payment</th>
                              <th className="px-3 py-1.5 text-right">Pets</th>
                              <th className="px-3 py-1.5 text-right">Grooming</th>
                              <th className="px-3 py-1.5 text-right">Upgrades</th>
                              <th className="px-3 py-1.5 text-right">CC Tip</th>
                              <th className="px-3 py-1.5 text-right">Discount</th>
                              <th className="px-3 py-1.5 text-right">Revenue</th>
                              <th className="px-3 py-1.5 text-right">Groomer Pay</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {entries.map((entry) => (
                              <tr key={entry.localId}>
                                <td className="px-3 py-1.5 capitalize">{entry.paymentType}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {mobileEntryDogCount(entry)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatMoney(mobileEntryGroomingPrice(entry))}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatMoney(moneyValue(entry.upgradeAmount))}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatMoney(moneyValue(entry.creditCardTip))}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatMoney(moneyValue(entry.discount))}
                                </td>
                                <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                                  {formatMoney(mobileEntryTotalPrice(entry))}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums">
                                  {formatMoney(mobileEntryGroomerPay(entry))}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function WeeklyMetric({
  label,
  value,
  expanded,
  controls,
  onToggle,
}: {
  label: string;
  value: string;
  expanded?: boolean;
  controls?: string;
  onToggle?: () => void;
}) {
  const content = (
    <>
      <p className="text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
        {label}
      </p>
      <span className="mt-1 flex items-center justify-between gap-2">
        <span className="text-lg font-semibold text-gray-900">{value}</span>
        {onToggle ? (
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className={cn(
              "h-4 w-4 shrink-0 text-gray-500 transition-transform",
              expanded && "rotate-180"
            )}
          >
            <path
              d="m5 7.5 5 5 5-5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
    </>
  );

  return onToggle ? (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className="rounded-lg border border-gray-200 px-3 py-2 text-left transition-colors hover:border-gray-300 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
    >
      {content}
    </button>
  ) : (
    <div className="rounded-lg border border-gray-200 px-3 py-2">{content}</div>
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
