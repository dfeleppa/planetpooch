"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";

const BUSINESS_KEY = "all-businesses-weekly";
const MS_PER_DAY = 86_400_000;

type MetricResponse = {
  metric: {
    totalRevenue: number | null;
    totalProfit: number | null;
    nonPayrollExpenses: number | null;
    payrollExpenses: number | null;
  } | null;
  ytd?: {
    totalRevenue: number | null;
    totalProfit: number | null;
    nonPayrollExpenses: number | null;
    payrollExpenses: number | null;
  };
  error?: string;
};

type SnapshotForm = {
  totalRevenue: string;
  nonPayrollExpenses: string;
  payrollExpenses: string;
  totalProfit: string;
};

type WeekOption = {
  weekStart: string;
  weekEnd: string;
  label: string;
};

const EMPTY_FORM: SnapshotForm = {
  totalRevenue: "",
  nonPayrollExpenses: "",
  payrollExpenses: "",
  totalProfit: "",
};

function dateFromParam(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function toDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function sundayOnOrBefore(date: Date): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() - next.getUTCDay());
  return next;
}

function parseYear(value: string | undefined): number {
  const now = utcToday();
  const year = Number(value);
  return Number.isInteger(year) && year >= 2020 && year <= now.getUTCFullYear() + 1
    ? year
    : now.getUTCFullYear();
}

function formatWeekLabel(weekStart: string, weekEnd: string): string {
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

function weeksForYear(year: number): WeekOption[] {
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const lastDay = new Date(Date.UTC(year, 11, 31));
  let cursor = sundayOnOrBefore(firstDay);
  const weeks: WeekOption[] = [];

  while (cursor <= lastDay) {
    const weekStart = toDateParam(cursor);
    const weekEnd = toDateParam(addDays(cursor, 6));
    weeks.push({
      weekStart,
      weekEnd,
      label: formatWeekLabel(weekStart, weekEnd),
    });
    cursor = addDays(cursor, 7);
  }

  return weeks;
}

function defaultWeekStartForYear(year: number, options: WeekOption[]): string {
  const currentWeekStart = toDateParam(sundayOnOrBefore(utcToday()));
  if (options.some((option) => option.weekStart === currentWeekStart)) {
    return currentWeekStart;
  }
  return year < utcToday().getUTCFullYear()
    ? options[options.length - 1]?.weekStart ?? ""
    : options[0]?.weekStart ?? "";
}

function centsToInput(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : (value / 100).toFixed(2);
}

function inputToCents(value: string): number | null {
  const normalized = value.replace(/[$,]/g, "").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : null;
}

function formatCents(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return (value / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formMetricCents(form: SnapshotForm, field: keyof SnapshotForm): number | null {
  return inputToCents(form[field]);
}

export function WeeklyFinancialSnapshot({
  year,
  week,
}: {
  year?: string;
  week?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedYear = parseYear(year);
  const weekOptions = useMemo(() => weeksForYear(selectedYear), [selectedYear]);
  const selectedWeekStart = weekOptions.some((option) => option.weekStart === week)
    ? week!
    : defaultWeekStartForYear(selectedYear, weekOptions);
  const selectedWeek =
    weekOptions.find((option) => option.weekStart === selectedWeekStart) ?? weekOptions[0];

  const [form, setForm] = useState<SnapshotForm>(EMPTY_FORM);
  const [ytd, setYtd] = useState<MetricResponse["ytd"]>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const years = useMemo(() => {
    const currentYear = utcToday().getUTCFullYear();
    const startYear = Math.min(2024, selectedYear);
    const endYear = Math.max(currentYear + 1, selectedYear);
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
  }, [selectedYear]);

  const operatingExpensesCents =
    (formMetricCents(form, "nonPayrollExpenses") ?? 0) +
    (formMetricCents(form, "payrollExpenses") ?? 0);
  const hasOperatingExpenseInput =
    form.nonPayrollExpenses.trim() !== "" || form.payrollExpenses.trim() !== "";

  useEffect(() => {
    if (!selectedWeek) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessage(null);

    const params = new URLSearchParams({
      business: BUSINESS_KEY,
      from: selectedWeek.weekStart,
      to: selectedWeek.weekEnd,
      year: String(selectedYear),
      includeYtd: "1",
    });

    fetch(`/api/finance/metrics?${params.toString()}`)
      .then((response) => response.json().then((json) => ({ ok: response.ok, json })))
      .then(({ ok, json }: { ok: boolean; json: MetricResponse }) => {
        if (cancelled) return;
        if (!ok) throw new Error(json.error || "Could not load weekly report.");

        setForm({
          totalRevenue: centsToInput(json.metric?.totalRevenue),
          nonPayrollExpenses: centsToInput(json.metric?.nonPayrollExpenses),
          payrollExpenses: centsToInput(json.metric?.payrollExpenses),
          totalProfit: centsToInput(json.metric?.totalProfit),
        });
        setYtd(json.ytd);
      })
      .catch((err) => {
        if (!cancelled) {
          setForm(EMPTY_FORM);
          setYtd(undefined);
          setError(err instanceof Error ? err.message : "Could not load weekly report.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedWeek, selectedYear]);

  function updateUrl(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (!value) next.delete(key);
      else next.set(key, value);
    }
    const query = next.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
    });
  }

  function updateField(field: keyof SnapshotForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function saveReport() {
    if (!selectedWeek) return;

    setSaving(true);
    setError(null);
    setMessage(null);

    const moneyFields: Array<[keyof SnapshotForm, string]> = [
      ["totalRevenue", "Income"],
      ["nonPayrollExpenses", "Expenses"],
      ["payrollExpenses", "Payroll"],
      ["totalProfit", "Net Profit"],
    ];
    const invalidField = moneyFields.find(
      ([field]) => form[field].trim() !== "" && inputToCents(form[field]) === null
    );
    if (invalidField) {
      setSaving(false);
      setError(`${invalidField[1]} must be a valid dollar amount.`);
      return;
    }

    const payload = {
      business: BUSINESS_KEY,
      periodStart: selectedWeek.weekStart,
      periodEnd: selectedWeek.weekEnd,
      totalRevenue: inputToCents(form.totalRevenue),
      nonPayrollExpenses: inputToCents(form.nonPayrollExpenses),
      payrollExpenses: inputToCents(form.payrollExpenses),
      totalProfit: inputToCents(form.totalProfit),
    };

    try {
      const response = await fetch("/api/finance/metrics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await response.json().catch(() => ({}))) as MetricResponse;
      if (!response.ok) throw new Error(json.error || "Could not save weekly report.");

      const reloadParams = new URLSearchParams({
        business: BUSINESS_KEY,
        from: selectedWeek.weekStart,
        to: selectedWeek.weekEnd,
        year: String(selectedYear),
        includeYtd: "1",
      });
      const reload = await fetch(`/api/finance/metrics?${reloadParams.toString()}`);
      const reloadJson = (await reload.json().catch(() => ({}))) as MetricResponse;
      if (reload.ok) setYtd(reloadJson.ytd);

      setMessage("Weekly report saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save weekly report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("space-y-5", (loading || isPending) && "opacity-70")}>
      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[160px_minmax(260px,1fr)_auto] lg:items-end">
            <Select
              label="Year"
              value={String(selectedYear)}
              onChange={(event) => {
                const nextYear = Number(event.target.value);
                const nextWeeks = weeksForYear(nextYear);
                updateUrl({
                  year: event.target.value,
                  week: defaultWeekStartForYear(nextYear, nextWeeks),
                });
              }}
              disabled={loading || saving}
            >
              {years.map((optionYear) => (
                <option key={optionYear} value={optionYear}>
                  {optionYear}
                </option>
              ))}
            </Select>
            <Select
              label="Week"
              value={selectedWeekStart}
              onChange={(event) => updateUrl({ week: event.target.value })}
              disabled={loading || saving}
            >
              {weekOptions.map((option) => (
                <option key={option.weekStart} value={option.weekStart}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button type="button" onClick={saveReport} disabled={loading || saving || !selectedWeek}>
              {saving ? "Saving..." : "Save report"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SummaryCard label="Income" value={formatCents(formMetricCents(form, "totalRevenue"))} />
        <SummaryCard
          label="Operating Expenses"
          value={hasOperatingExpenseInput ? formatCents(operatingExpensesCents) : "-"}
        />
        <SummaryCard label="Net Profit" value={formatCents(formMetricCents(form, "totalProfit"))} />
        <SummaryCard label={`YTD ${selectedYear} Revenue`} value={formatCents(ytd?.totalRevenue)} />
        <SummaryCard label={`YTD ${selectedYear} Net Profit`} value={formatCents(ytd?.totalProfit)} />
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MoneyInput
              label="Income"
              value={form.totalRevenue}
              onChange={(value) => updateField("totalRevenue", value)}
              disabled={loading || saving}
            />
            <MoneyInput
              label="Expenses"
              value={form.nonPayrollExpenses}
              onChange={(value) => updateField("nonPayrollExpenses", value)}
              disabled={loading || saving}
            />
            <MoneyInput
              label="Payroll"
              value={form.payrollExpenses}
              onChange={(value) => updateField("payrollExpenses", value)}
              disabled={loading || saving}
            />
            <MoneyInput
              label="Net Profit"
              value={form.totalProfit}
              onChange={(value) => updateField("totalProfit", value)}
              disabled={loading || saving}
            />
          </div>
        </CardContent>
      </Card>

      {(message || error) && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
          )}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </div>
      )}
    </div>
  );
}

function MoneyInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      label={label}
      inputMode="decimal"
      placeholder="0.00"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    />
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{label}</p>
        <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">{value}</p>
      </CardContent>
    </Card>
  );
}
