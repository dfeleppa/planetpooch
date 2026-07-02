"use client";

import Link from "next/link";
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
  normalizeEmployeeName,
  parsePayrollDurationToSeconds,
  type PayrollBusinessValue,
  type PayrollCategoryValue,
} from "@/lib/payroll";
import { cn } from "@/lib/utils";

const MS_PER_DAY = 86_400_000;

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

type SavedPayrollWeek = {
  id: string;
  business: PayrollBusinessValue;
  weekStart: string;
  weekEnd: string;
  rows: SavedPayrollRow[];
  mobileGroomingEntries: SavedMobileGroomingEntry[];
};

type PayrollApiResponse = {
  business: PayrollBusinessValue;
  weeks: SavedWeekSummary[];
  week: SavedPayrollWeek | null;
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

const PAYROLL_BUSINESS_HREFS: Record<PayrollBusinessValue, string> = {
  "pet-resort": "/finance/payroll",
  "mobile-grooming": "/finance/payroll/mobile-grooming",
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

function lastCompletedWeekStart() {
  const today = new Date();
  const localTodayUtc = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const currentSunday = new Date(localTodayUtc);
  currentSunday.setUTCDate(localTodayUtc.getUTCDate() - localTodayUtc.getUTCDay());
  return toDateParam(new Date(currentSunday.getTime() - 7 * MS_PER_DAY));
}

function recentCompletedWeeks(count = 26): string[] {
  const start = dateFromParam(lastCompletedWeekStart());
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
  entries: SavedMobileGroomingEntry[] = []
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

  return {
    rows: importRowsToEditable(rows),
    business: isPayrollBusiness(payload.business) ? payload.business : null,
    weekStart,
    weekEnd,
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

function mobileEntryGroomerPay(entry: EditableMobileGroomingEntry): number {
  return (moneyValue(entry.price) + moneyValue(entry.upgradeAmount)) * 0.4 +
    moneyValue(entry.creditCardTip);
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

function mobileEntryDogs(entry: EditableMobileGroomingEntry): number {
  return Math.max(0, Math.round(Number(entry.dogs) || 0));
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
  const [weekStart, setWeekStart] = useState(lastCompletedWeekStart);
  const [rows, setRows] = useState<EditableRow[]>([]);
  const [mobileEntries, setMobileEntries] = useState<EditableMobileGroomingEntry[]>([]);
  const [selectedMobileEmployee, setSelectedMobileEmployee] = useState("");
  const [importText, setImportText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const weekEnd = addDaysParam(weekStart, 6);
  const isMobileGrooming = business === "mobile-grooming";
  const employeeOptions = employeeOptionsByBusiness[business] ?? EMPTY_EMPLOYEE_OPTIONS;
  const mobileEmployeeChoicesUnavailable = isMobileGrooming && employeeOptions.length === 0;
  const mobileEmployeePlaceholder =
    employeeOptions.length === 0 ? "No employees available" : "Select employee";
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
      byStart.set(week.weekStart, {
        weekStart: week.weekStart,
        weekEnd: week.weekEnd,
        stored: true,
      });
    }
    for (const start of recentCompletedWeeks()) {
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
  }, [savedWeeks, weekEnd, weekStart]);

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

  const mobileTotals = useMemo(() => {
    return mobileEntries.reduce(
      (total, entry) => {
        const totalPrice = mobileEntryTotalPrice(entry);
        total.stops += 1;
        total.dogs += mobileEntryDogs(entry);
        total.pricing += totalPrice;
        total.cash += entry.paymentType === "cash" ? totalPrice : 0;
        total.groomerPay += mobileEntryGroomerPay(entry);
        total.upgrades += moneyValue(entry.upgradeAmount);
        return total;
      },
      {
        stops: 0,
        dogs: 0,
        pricing: 0,
        cash: 0,
        groomerPay: 0,
        upgrades: 0,
      }
    );
  }, [mobileEntries]);

  const loadWeek = useCallback(async (
    selectedWeekStart: string | undefined,
    selectedBusiness: PayrollBusinessValue
  ) => {
    setBusiness(selectedBusiness);
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ business: selectedBusiness });
      if (selectedWeekStart) params.set("weekStart", selectedWeekStart);
      const url = `/api/finance/payroll?${params.toString()}`;
      const response = await fetch(url);
      const data = (await response.json()) as PayrollApiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not load payroll.");

      setSavedWeeks(data.weeks);
      setBusiness(data.week?.business ?? data.business ?? selectedBusiness);
      if (data.week) {
        setWeekStart(data.week.weekStart);
        setRows(savedRowsToEditable(data.week.rows));
        setMobileEntries(savedMobileEntriesToEditable(data.week.mobileGroomingEntries));
      } else {
        const nextWeekStart = selectedWeekStart ?? lastCompletedWeekStart();
        setWeekStart(nextWeekStart);
        setRows([]);
        setMobileEntries([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load payroll.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeek(undefined, initialBusiness);
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

  function addMobileEmployee(employeeName: string) {
    setSelectedMobileEmployee(normalizeEmployeeName(employeeName));
  }

  function removeRow(localId: string) {
    setRows((current) => current.filter((row) => row.localId !== localId));
  }

  function addMobileEntry(serviceDate: string) {
    const employeeName = normalizeEmployeeName(selectedMobileEmployee);
    if (!employeeName) {
      setError("Select an employee before adding a stop.");
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

  function applyImportText(text: string) {
    setError(null);
    setMessage(null);
    try {
      const imported = extractImportPayload(text);
      if (imported.business) setBusiness(imported.business);
      if (imported.weekStart) setWeekStart(imported.weekStart);
      setRows(imported.rows);
      setMobileEntries([]);
      setMessage(`Loaded ${imported.rows.length} employee rows.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not import payroll data.");
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
          dogs: Math.max(0, Math.round(Number(entry.dogs) || 0)),
          price: moneyValue(entry.price),
          upgradeQuantity: Math.max(0, Math.round(Number(entry.upgradeQuantity) || 0)),
          upgradesCents: Math.round(moneyValue(entry.upgradeAmount) * 100),
          creditCardTip: moneyValue(entry.creditCardTip),
          discount: moneyValue(entry.discount),
        })).filter((entry) => entry.employeeName);

        if (cleanEntries.length === 0) {
          throw new Error("Add at least one mobile grooming stop.");
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
        const data = (await response.json()) as { week?: SavedPayrollWeek; error?: string };
        if (!response.ok || !data.week) throw new Error(data.error || "Could not save payroll.");

        setWeekStart(data.week.weekStart);
        setBusiness(data.week.business);
        setRows(savedRowsToEditable(data.week.rows));
        setMobileEntries(savedMobileEntriesToEditable(data.week.mobileGroomingEntries));
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

      const response = await fetch("/api/finance/payroll", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weekStart,
          weekEnd,
          business,
          rows: cleanRows,
        }),
      });
      const data = (await response.json()) as { week?: SavedPayrollWeek; error?: string };
      if (!response.ok || !data.week) throw new Error(data.error || "Could not save payroll.");

      setWeekStart(data.week.weekStart);
      setBusiness(data.week.business);
      setRows(savedRowsToEditable(data.week.rows));
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

  return (
    <div className={cn("space-y-5", loading && "opacity-70")}>
      <div>
        <p className="mb-1 text-sm font-medium text-gray-700">Business</p>
        <nav className="pp-tabs" aria-label="Payroll business">
          {PAYROLL_BUSINESSES.map((option) => {
            const active = business === option.value;
            return (
              <Link
                key={option.value}
                href={PAYROLL_BUSINESS_HREFS[option.value]}
                className={cn("pp-tab", active && "is-on")}
                aria-current={active ? "page" : undefined}
              >
                {option.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div>
        <h2 className="text-xl font-semibold text-gray-900">Payroll</h2>
        <p className="mt-1 text-gray-500">
          {isMobileGrooming ? "Weekly mobile grooming stops" : "Weekly staff hours"}
        </p>
      </div>

      {!isMobileGrooming && (
        <Card>
          <CardContent className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_180px_180px_auto] lg:items-end">
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
                }}
                disabled={loading || saving}
              />
              <Input label="Week end" type="date" value={weekEnd} readOnly />
              <Button type="button" onClick={savePayroll} disabled={loading || saving}>
                {saving ? "Saving..." : "Save payroll"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isMobileGrooming && (
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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <SummaryCard
            label="Total Stops"
            value={String(mobileTotals.stops)}
            detail="this week"
          />
          <SummaryCard
            label="Total Dogs"
            value={String(mobileTotals.dogs)}
            detail="all stops"
          />
          <SummaryCard
            label="Total Pricing"
            value={formatMoney(mobileTotals.pricing)}
            detail="after discounts"
          />
          <SummaryCard
            label="Cash Total"
            value={formatMoney(mobileTotals.cash)}
            detail="cash stops"
          />
          <SummaryCard
            label="Groomer Pay"
            value={formatMoney(mobileTotals.groomerPay)}
            detail="weekly total"
          />
          <SummaryCard
            label="Upgrades ($)"
            value={formatMoney(mobileTotals.upgrades)}
            detail="upgrade sales"
          />
        </div>
      )}

      {!isMobileGrooming && (
        <Card>
          <CardContent className="space-y-3">
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
                  placeholder='{"weekStart":"2026-06-07","weekEnd":"2026-06-13","rows":[...]}'
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => applyImportText(importText)}
                  disabled={saving || !importText.trim()}
                >
                  Load paste
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
              {isMobileGrooming ? "Mobile grooming stops" : "Employee hours"}
            </h2>
            {isMobileGrooming ? (
              <div className="grid w-full gap-3 md:max-w-lg md:grid-cols-[minmax(220px,1fr)_auto] md:items-end">
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
                <Button type="button" onClick={savePayroll} disabled={loading || saving}>
                  {saving ? "Saving..." : "Save payroll"}
                </Button>
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
            <div className="grid gap-3">
              {weekDays.map((day) => {
                const dayEntries = mobileEntries.filter((entry) => entry.serviceDate === day.value);
                const dayTotal = dayEntries.reduce(
                  (sum, entry) => sum + mobileEntryTotalPrice(entry),
                  0
                );
                const dayPay = dayEntries.reduce(
                  (sum, entry) => sum + mobileEntryGroomerPay(entry),
                  0
                );
                return (
                  <div key={day.value} className="rounded-lg border border-gray-200 bg-white">
                    <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{day.label}</h3>
                        <p className="text-xs text-gray-500">
                          {dayEntries.length} stops · {formatMoney(dayTotal)} total ·{" "}
                          {formatMoney(dayPay)} groomer pay
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => addMobileEntry(day.value)}
                        disabled={saving || mobileEmployeeChoicesUnavailable}
                      >
                        + Stop
                      </Button>
                    </div>

                    {dayEntries.length === 0 ? (
                      <p className="px-4 py-6 text-center text-sm text-gray-500">
                        No stops for this day.
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
        label="# Dogs"
        value={entry.dogs}
        onChange={(value) => onChange({ dogs: value })}
        disabled={saving}
        step="1"
      />
      <EntryInput
        label="Price"
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
