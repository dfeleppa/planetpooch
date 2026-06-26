"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  FacebookCampaignReportTable,
  GoogleCampaignReportTable,
} from "./FacebookCampaignReportTable";

const BUSINESSES = [
  { value: "", label: "All Businesses" },
  { value: "mobile-grooming", label: "Planet Pooch Mobile Grooming" },
  { value: "pet-resort", label: "Planet Pooch Pet Resort" },
];

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
] as const;

function parseMonthParam(value: string | undefined): number {
  const month = Number(value);
  return Number.isInteger(month) && month >= 1 && month <= 12
    ? month
    : new Date().getMonth() + 1;
}

function parseYearParam(value: string | undefined): number {
  const year = Number(value);
  const now = new Date();
  return Number.isInteger(year) && year >= 2020 && year <= now.getFullYear() + 1
    ? year
    : now.getFullYear();
}

function formatDateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function computeMonthRange(year: number, month: number): { from: string; to: string } {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  return { from: formatDateParam(start), to: formatDateParam(end) };
}

type MetricData = {
  totalRevenue: number | null;
  totalProfit: number | null;
  totalCustomers: number | null;
  totalAdSpend: number | null;
  totalConversions: number | null;
  metaAdSpend: number | null;
  metaRevenue: number | null;
  googleAdSpend: number | null;
  googleRevenue: number | null;
  statement: StatementData;
};

type StatementData = {
  income: number | null;
  operatingExpenses: number | null;
  expenses: number | null;
  payroll: number | null;
  netProfit: number | null;
  ytdRevenue: number | null;
  ytdNetProfit: number | null;
};

const EMPTY_METRIC: MetricData = {
  totalRevenue: null,
  totalProfit: null,
  totalCustomers: null,
  totalAdSpend: null,
  totalConversions: null,
  metaAdSpend: null,
  metaRevenue: null,
  googleAdSpend: null,
  googleRevenue: null,
  statement: {
    income: null,
    operatingExpenses: null,
    expenses: null,
    payroll: null,
    netProfit: null,
    ytdRevenue: null,
    ytdNetProfit: null,
  },
};

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cents(val: number | null) {
  if (val === null) return null;
  return val / 100;
}

function formatDollars(val: number | null) {
  if (val === null) return "—";
  return val.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCents(val: number | null) {
  return val === null ? "-" : formatDollars(val / 100);
}

function formatRatio(val: number | null) {
  if (val === null) return "—";
  return val.toFixed(2) + "x";
}

function computeKPIs(m: MetricData) {
  const cac =
    m.totalAdSpend !== null && m.totalConversions !== null && m.totalConversions > 0
      ? cents(m.totalAdSpend)! / m.totalConversions
      : null;

  const ltvRevenue =
    m.totalRevenue !== null && m.totalCustomers !== null && m.totalCustomers > 0
      ? cents(m.totalRevenue)! / m.totalCustomers
      : null;

  const ltvProfit =
    m.totalProfit !== null && m.totalCustomers !== null && m.totalCustomers > 0
      ? cents(m.totalProfit)! / m.totalCustomers
      : null;

  const metaRoas =
    m.metaRevenue !== null && m.metaAdSpend !== null && m.metaAdSpend > 0
      ? m.metaRevenue / m.metaAdSpend
      : null;

  const googleRoas =
    m.googleRevenue !== null && m.googleAdSpend !== null && m.googleAdSpend > 0
      ? m.googleRevenue / m.googleAdSpend
      : null;

  return { cac, ltvRevenue, ltvProfit, metaRoas, googleRoas };
}

export function FinanceDashboard({
  business,
  month,
  year,
}: {
  business: string;
  month?: string;
  year?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [metric, setMetric] = useState<MetricData>(EMPTY_METRIC);

  const selectedMonth = parseMonthParam(month);
  const selectedYear = parseYearParam(year);
  const { from, to } = computeMonthRange(selectedYear, selectedMonth);
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const startYear = Math.min(2024, selectedYear);
    const endYear = Math.max(currentYear + 1, selectedYear);
    return Array.from(
      { length: endYear - startYear + 1 },
      (_, index) => startYear + index
    );
  }, [selectedYear]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/finance/aggregated?business=${business}&from=${from}&to=${to}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.metric) {
          const m = json.metric;
          const statement = m.statement ?? {};
          setMetric({
            totalRevenue: m.totalRevenue,
            totalProfit: m.totalProfit,
            totalCustomers: m.totalCustomers,
            totalAdSpend: m.totalAdSpend,
            totalConversions: m.totalConversions,
            metaAdSpend: m.metaAdSpend,
            metaRevenue: m.metaRevenue,
            googleAdSpend: m.googleAdSpend,
            googleRevenue: m.googleRevenue,
            statement: {
              income: nullableNumber(statement.income ?? m.totalRevenue),
              operatingExpenses: nullableNumber(statement.operatingExpenses),
              expenses: nullableNumber(statement.expenses),
              payroll: nullableNumber(statement.payroll),
              netProfit: nullableNumber(statement.netProfit ?? m.totalProfit),
              ytdRevenue: nullableNumber(statement.ytdRevenue),
              ytdNetProfit: nullableNumber(statement.ytdNetProfit),
            },
          });
        } else {
          setMetric(EMPTY_METRIC);
        }
      })
      .catch(() => {
        if (!cancelled) setMetric(EMPTY_METRIC);
      });

    return () => {
      cancelled = true;
    };
  }, [business, from, to]);

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  const rangeLabel =
    `${MONTHS[selectedMonth - 1].label} ${selectedYear}`;
  const businessLabel =
    BUSINESSES.find((b) => b.value === business)?.label ?? "All Businesses";

  const kpis = computeKPIs(metric);

  return (
    <div className={cn(isPending && "opacity-60 pointer-events-none")}>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <select
          value={business}
          onChange={(e) =>
            update({ business: e.target.value || undefined })
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Filter by business"
        >
          {BUSINESSES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <select
          value={String(selectedMonth)}
          onChange={(e) =>
            update({
              month: e.target.value,
              range: undefined,
              from: undefined,
              to: undefined,
            })
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Performance month"
        >
          {MONTHS.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>

        <select
          value={String(selectedYear)}
          onChange={(e) =>
            update({
              year: e.target.value,
              range: undefined,
              from: undefined,
              to: undefined,
            })
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Performance year"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>

        {(business || month || year) && (
          <button
            type="button"
            onClick={() =>
              update({
                business: undefined,
                month: undefined,
                year: undefined,
                range: undefined,
                from: undefined,
                to: undefined,
              })
            }
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        <KPICard
          value={formatDollars(kpis.cac)}
          label="Cost to Acquire a Customer"
          abbr="CAC"
          hasData={kpis.cac !== null}
        />
        <KPICard
          value={formatDollars(kpis.ltvRevenue)}
          label="Long Term Value (Revenue)"
          abbr="LTV — Revenue"
          hasData={kpis.ltvRevenue !== null}
        />
        <KPICard
          value={formatDollars(kpis.ltvProfit)}
          label="Long Term Value (Profit)"
          abbr="LTV — Profit"
          hasData={kpis.ltvProfit !== null}
        />
        <KPICard
          value={formatRatio(kpis.metaRoas)}
          label="Return on Ad Spend"
          abbr="Meta Ads ROAS"
          hasData={kpis.metaRoas !== null}
        />
        <KPICard
          value={formatRatio(kpis.googleRoas)}
          label="Return on Ad Spend"
          abbr="Google Ads ROAS"
          hasData={kpis.googleRoas !== null}
        />
      </div>

      <FinancialStatementSection
        statement={metric.statement}
        rangeLabel={rangeLabel}
        ytdLabel={`YTD ${selectedYear}`}
      />

      <FacebookCampaignReportTable business={business} from={from} to={to} />
      <GoogleCampaignReportTable business={business} from={from} to={to} />

      <p className="mt-6 text-xs text-gray-400">
        Showing {businessLabel} &middot; {rangeLabel}
      </p>
    </div>
  );
}

function FinancialStatementSection({
  statement,
  rangeLabel,
  ytdLabel,
}: {
  statement: StatementData;
  rangeLabel: string;
  ytdLabel: string;
}) {
  return (
    <Card className="mt-6 overflow-hidden rounded-lg shadow-none">
      <div className="flex flex-col gap-1 border-b border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-gray-900">Financial Snapshot</h2>
        <p className="text-sm text-gray-500">{rangeLabel}</p>
      </div>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(220px,1fr)]">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatementMetric
            label="Income"
            value={formatCents(statement.income)}
            hasData={statement.income !== null}
          />
          <StatementMetric
            label="Operating Expenses"
            value={formatCents(statement.operatingExpenses)}
            hasData={statement.operatingExpenses !== null}
          />
          <StatementMetric
            label="Net Profit"
            value={formatCents(statement.netProfit)}
            hasData={statement.netProfit !== null}
            tone={(statement.netProfit ?? 0) < 0 ? "danger" : "default"}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
              Expense Breakdown
            </p>
            <div className="mt-3 space-y-2">
              <StatementRow label="Expenses" value={formatCents(statement.expenses)} />
              <StatementRow label="Payroll" value={formatCents(statement.payroll)} />
            </div>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
              {ytdLabel}
            </p>
            <div className="mt-3 space-y-2">
              <StatementRow label="Revenue" value={formatCents(statement.ytdRevenue)} />
              <StatementRow label="Net Profit" value={formatCents(statement.ytdNetProfit)} />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StatementMetric({
  label,
  value,
  hasData,
  tone = "default",
}: {
  label: string;
  value: string;
  hasData: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">{label}</p>
      <p
        className={cn(
          "mt-2 text-2xl font-bold tabular-nums",
          !hasData && "text-gray-300",
          hasData && tone === "default" && "text-gray-900",
          hasData && tone === "danger" && "text-red-600"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function StatementRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="font-medium text-gray-600">{label}</span>
      <span className="font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

function KPICard({
  value,
  label,
  abbr,
  hasData,
}: {
  value: string;
  label: string;
  abbr: string;
  hasData: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-6 text-center">
        <p className={cn("text-3xl font-bold", hasData ? "text-gray-900" : "text-gray-300")}>
          {value}
        </p>
        <p className="text-sm font-medium text-gray-900 mt-2">{label}</p>
        <p className="text-xs text-gray-500">{abbr}</p>
      </CardContent>
    </Card>
  );
}
