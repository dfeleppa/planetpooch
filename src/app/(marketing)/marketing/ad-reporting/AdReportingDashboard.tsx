"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import {
  FacebookCampaignReportTable,
  GoogleCampaignReportTable,
} from "./CampaignReportTables";
import { GoogleLsaLeadReportTable } from "./GoogleLsaLeadReportTable";

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
  googleLsaAdSpend: number | null;
  googleLsaRevenue: number | null;
  attributionThrough: string | null;
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
  googleLsaAdSpend: null,
  googleLsaRevenue: null,
  attributionThrough: null,
};

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

  const googleLsaRoas =
    m.googleLsaRevenue !== null && m.googleLsaAdSpend !== null && m.googleLsaAdSpend > 0
      ? m.googleLsaRevenue / m.googleLsaAdSpend
      : null;

  return { cac, ltvRevenue, ltvProfit, metaRoas, googleRoas, googleLsaRoas };
}

export function AdReportingDashboard({
  business,
  month,
  year,
  range,
  source,
}: {
  business: string;
  month?: string;
  year?: string;
  range?: string;
  source?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [metric, setMetric] = useState<MetricData>(EMPTY_METRIC);

  const selectedMonth = parseMonthParam(month);
  const selectedYear = parseYearParam(year);
  const is2026AttributionRange =
    range === "2026-through-sep-5" || (!range && !month && !year);
  const { from, to } = is2026AttributionRange
    ? { from: "2026-01-01", to: "2026-09-05" }
    : computeMonthRange(selectedYear, selectedMonth);
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
            googleLsaAdSpend: m.googleLsaAdSpend,
            googleLsaRevenue: m.googleLsaRevenue,
            attributionThrough: m.attributionThrough,
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

  const rangeLabel = is2026AttributionRange
    ? "January 1 – September 5, 2026"
    : selectedYear === 2026 && selectedMonth === 9
      ? "September 1–5, 2026"
      : `${MONTHS[selectedMonth - 1].label} ${selectedYear}`;
  const businessLabel =
    BUSINESSES.find((b) => b.value === business)?.label ?? "All Businesses";

  const kpis = computeKPIs(metric);
  const selectedSource =
    source === "meta" || source === "google-ads" || source === "google-lsa"
      ? source
      : "all";

  return (
    <div className={cn(isPending && "opacity-60 pointer-events-none")}>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => update({ range: "2026-through-sep-5", month: undefined, year: undefined })}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-sm font-medium",
            is2026AttributionRange
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50",
          )}
        >
          Jan 1 – Sep 5 report
        </button>
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
      <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4", !is2026AttributionRange && "lg:grid-cols-6")}>
        {!is2026AttributionRange && (
          <>
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
          </>
        )}
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
        <KPICard
          value={formatRatio(kpis.googleLsaRoas)}
          label="Return on Ad Spend"
          abbr="Google LSA ROAS"
          hasData={kpis.googleLsaRoas !== null}
        />
      </div>

      <AttributionSummary metric={metric} source={selectedSource} rangeLabel={rangeLabel} />

      {!is2026AttributionRange && (selectedSource === "all" || selectedSource === "meta") && (
        <FacebookCampaignReportTable business={business} from={from} to={to} />
      )}
      {!is2026AttributionRange && (selectedSource === "all" || selectedSource === "google-ads") && (
        <GoogleCampaignReportTable business={business} from={from} to={to} />
      )}
      {!is2026AttributionRange && selectedSource === "google-lsa" && (
        <GoogleLsaLeadReportTable business={business} from={from} to={to} />
      )}

      <p className="mt-6 text-xs text-gray-400">
        Showing {businessLabel} &middot; {rangeLabel}
      </p>
    </div>
  );
}

function AttributionSummary({
  metric,
  source,
  rangeLabel,
}: {
  metric: MetricData;
  source: "all" | "meta" | "google-ads" | "google-lsa";
  rangeLabel: string;
}) {
  const rows = [
    { key: "meta", label: "Meta Ads", spend: metric.metaAdSpend, revenue: metric.metaRevenue },
    { key: "google-ads", label: "Google Ads", spend: metric.googleAdSpend, revenue: metric.googleRevenue },
    { key: "google-lsa", label: "Google LSA", spend: metric.googleLsaAdSpend, revenue: metric.googleLsaRevenue },
  ].filter((row) => source === "all" || row.key === source);
  const totalSpend = rows.every((row) => row.spend !== null)
    ? rows.reduce((sum, row) => sum + (row.spend ?? 0), 0)
    : null;
  const totalRevenue = rows.every((row) => row.revenue !== null)
    ? rows.reduce((sum, row) => sum + (row.revenue ?? 0), 0)
    : null;
  const totalRoas = totalSpend && totalRevenue !== null ? totalRevenue / totalSpend : null;

  return (
    <Card className="mt-6 overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="font-semibold text-gray-900">Attributed revenue by source</h3>
          <p className="mt-1 text-xs text-gray-500">
            All businesses · Completed MoeGo service revenue by sale date · {rangeLabel}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 text-right font-medium">Ad spend</th>
                <th className="px-5 py-3 text-right font-medium">Revenue</th>
                <th className="px-5 py-3 text-right font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const roas = row.spend && row.revenue !== null ? row.revenue / row.spend : null;
                return (
                  <tr key={row.key}>
                    <td className="px-5 py-3 font-medium text-gray-900">{row.label}</td>
                    <td className="px-5 py-3 text-right">{formatDollars(cents(row.spend))}</td>
                    <td className="px-5 py-3 text-right">{formatDollars(cents(row.revenue))}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatRatio(roas)}</td>
                  </tr>
                );
              })}
              {source === "all" && (
                <tr className="bg-gray-50 font-semibold text-gray-900">
                  <td className="px-5 py-3">Total</td>
                  <td className="px-5 py-3 text-right">{formatDollars(cents(totalSpend))}</td>
                  <td className="px-5 py-3 text-right">{formatDollars(cents(totalRevenue))}</td>
                  <td className="px-5 py-3 text-right">{formatRatio(totalRoas)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {metric.googleAdSpend === null && (
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-amber-700">
            Source spend is available for the Jan 1 – Sep 5 report. Monthly revenue is dated, but the supplied spend was a period total.
          </p>
        )}
      </CardContent>
    </Card>
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
