"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { FacebookCampaignReportTable } from "./FacebookCampaignReportTable";
import { LeadSourceReportTable } from "./LeadSourceReportTable";

const BUSINESSES = [
  { value: "", label: "All Businesses" },
  { value: "mobile-grooming", label: "Planet Pooch Mobile Grooming" },
  { value: "pet-resort", label: "Planet Pooch Pet Resort" },
  { value: "all-businesses-manual", label: "All Businesses (Manual)" },
  { value: "mobile-grooming-manual", label: "Mobile Grooming (Manual)" },
  { value: "pet-resort-manual", label: "Pet Resort (Manual)" },
];

const MANUAL_BUSINESSES = ["all-businesses-manual", "mobile-grooming-manual", "pet-resort-manual"];

const DATE_RANGES = [
  { value: "mtd", label: "Month to Date" },
  { value: "last-month", label: "Last Month" },
  { value: "qtd", label: "Quarter to Date" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "ytd", label: "Year to Date" },
  { value: "last-year", label: "Last Year" },
  { value: "last-30", label: "Last 30 Days" },
  { value: "last-90", label: "Last 90 Days" },
  { value: "custom", label: "Custom Range" },
];

function computeDateRange(
  range: string,
  customFrom?: string | null,
  customTo?: string | null,
): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();

  const fmt = (dt: Date) => dt.toISOString().slice(0, 10);

  switch (range) {
    case "last-month": {
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case "qtd": {
      const qStart = new Date(y, Math.floor(m / 3) * 3, 1);
      return { from: fmt(qStart), to: fmt(now) };
    }
    case "last-quarter": {
      const cqStart = Math.floor(m / 3) * 3;
      const start = new Date(y, cqStart - 3, 1);
      const end = new Date(y, cqStart, 0);
      return { from: fmt(start), to: fmt(end) };
    }
    case "ytd":
      return { from: `${y}-01-01`, to: fmt(now) };
    case "last-year":
      return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
    case "last-30": {
      const d30 = new Date(now);
      d30.setDate(d30.getDate() - 30);
      return { from: fmt(d30), to: fmt(now) };
    }
    case "last-90": {
      const d90 = new Date(now);
      d90.setDate(d90.getDate() - 90);
      return { from: fmt(d90), to: fmt(now) };
    }
    case "custom":
      return {
        from: customFrom || fmt(new Date(y, m, 1)),
        to: customTo || fmt(now),
      };
    default: {
      // mtd
      const start = new Date(y, m, 1);
      return { from: fmt(start), to: fmt(now) };
    }
  }
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
};

function cents(val: number | null) {
  if (val === null) return null;
  return val / 100;
}

function formatDollars(val: number | null) {
  if (val === null) return "—";
  return "$" + val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatRatio(val: number | null) {
  if (val === null) return "—";
  return val.toFixed(2) + "x";
}

function formatInt(val: number | null) {
  if (val === null) return "—";
  return val.toLocaleString("en-US");
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

function DollarInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (val: number | null) => void;
}) {
  const display = value !== null ? (value / 100).toFixed(2) : "";
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} <span className="text-gray-400 font-normal">({hint})</span>
      </label>
      <div className="relative">
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={display}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") { onChange(null); return; }
            onChange(Math.round(parseFloat(v) * 100));
          }}
          className="w-full pl-6 pr-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="0.00"
        />
      </div>
    </div>
  );
}

function IntInput({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | null;
  onChange: (val: number | null) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">
        {label} <span className="text-gray-400 font-normal">({hint})</span>
      </label>
      <input
        type="number"
        step="1"
        min="0"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") { onChange(null); return; }
          onChange(parseInt(v, 10));
        }}
        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        placeholder="0"
      />
    </div>
  );
}

export function FinanceDashboard({
  business,
  range,
}: {
  business: string;
  range: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [metric, setMetric] = useState<MetricData>(EMPTY_METRIC);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const isManual = MANUAL_BUSINESSES.includes(business);
  const { from, to } = computeDateRange(
    range,
    searchParams.get("from"),
    searchParams.get("to"),
  );

  const fetchMetric = useCallback(async () => {
    if (isManual) {
      try {
        const res = await fetch(
          `/api/finance/metrics?business=${business}&from=${from}&to=${to}`,
        );
        const json = await res.json();
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
          });
        } else {
          setMetric(EMPTY_METRIC);
        }
      } catch {
        setMetric(EMPTY_METRIC);
      }
    } else {
      try {
        const res = await fetch(
          `/api/finance/aggregated?business=${business}&from=${from}&to=${to}`,
        );
        const json = await res.json();
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
          });
        } else {
          setMetric(EMPTY_METRIC);
        }
      } catch {
        setMetric(EMPTY_METRIC);
      }
    }
    setLoaded(true);
  }, [business, from, to, isManual]);

  useEffect(() => {
    setLoaded(false);
    fetchMetric();
  }, [fetchMetric]);

  async function saveMetric() {
    setSaving(true);
    try {
      await fetch("/api/finance/metrics", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business,
          periodStart: from,
          periodEnd: to,
          ...metric,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

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
    DATE_RANGES.find((r) => r.value === range)?.label ?? "Month to Date";
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
          value={range}
          onChange={(e) =>
            update({ range: e.target.value === "mtd" ? undefined : e.target.value })
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Date range"
        >
          {DATE_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {range === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={searchParams.get("from") ?? ""}
              onChange={(e) => update({ from: e.target.value || undefined })}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Start date"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={searchParams.get("to") ?? ""}
              onChange={(e) => update({ to: e.target.value || undefined })}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="End date"
            />
          </div>
        )}

        {(business || range !== "mtd") && (
          <button
            type="button"
            onClick={() =>
              update({
                business: undefined,
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

      <LeadSourceReportTable business={business} from={from} to={to} />
      <FacebookCampaignReportTable business={business} from={from} to={to} />

      {/* Manual entry form */}
      {isManual && loaded && (
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Manual Entry
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {businessLabel} &middot; {from} to {to}
              </p>
            </div>
            <button
              type="button"
              onClick={saveMetric}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Revenue &amp; Customers
              </p>
              <DollarInput
                label="Total Revenue"
                hint="gross revenue"
                value={metric.totalRevenue}
                onChange={(v) => setMetric((p) => ({ ...p, totalRevenue: v }))}
              />
              <DollarInput
                label="Total Profit"
                hint="net profit"
                value={metric.totalProfit}
                onChange={(v) => setMetric((p) => ({ ...p, totalProfit: v }))}
              />
              <IntInput
                label="Total Customers"
                hint="unique customers"
                value={metric.totalCustomers}
                onChange={(v) => setMetric((p) => ({ ...p, totalCustomers: v }))}
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Acquisition
              </p>
              <DollarInput
                label="Total Ad Spend"
                hint="all platforms"
                value={metric.totalAdSpend}
                onChange={(v) => setMetric((p) => ({ ...p, totalAdSpend: v }))}
              />
              <IntInput
                label="Total Conversions"
                hint="new customers from ads"
                value={metric.totalConversions}
                onChange={(v) => setMetric((p) => ({ ...p, totalConversions: v }))}
              />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Ad Platform Breakdown
              </p>
              <DollarInput
                label="Meta Ad Spend"
                hint="Facebook / Instagram"
                value={metric.metaAdSpend}
                onChange={(v) => setMetric((p) => ({ ...p, metaAdSpend: v }))}
              />
              <DollarInput
                label="Meta Revenue"
                hint="revenue from Meta ads"
                value={metric.metaRevenue}
                onChange={(v) => setMetric((p) => ({ ...p, metaRevenue: v }))}
              />
              <DollarInput
                label="Google Ad Spend"
                hint="Google Ads"
                value={metric.googleAdSpend}
                onChange={(v) => setMetric((p) => ({ ...p, googleAdSpend: v }))}
              />
              <DollarInput
                label="Google Revenue"
                hint="revenue from Google ads"
                value={metric.googleRevenue}
                onChange={(v) => setMetric((p) => ({ ...p, googleRevenue: v }))}
              />
            </div>
          </div>

          {/* Live computed preview */}
          <div className="mt-5 pt-4 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Computed from your inputs
            </p>
            <div className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-gray-700">
              <span>CAC: <strong>{formatDollars(kpis.cac)}</strong></span>
              <span>LTV (Rev): <strong>{formatDollars(kpis.ltvRevenue)}</strong></span>
              <span>LTV (Profit): <strong>{formatDollars(kpis.ltvProfit)}</strong></span>
              <span>Meta ROAS: <strong>{formatRatio(kpis.metaRoas)}</strong></span>
              <span>Google ROAS: <strong>{formatRatio(kpis.googleRoas)}</strong></span>
            </div>
          </div>
        </div>
      )}

      <p className="mt-6 text-xs text-gray-400">
        Showing {businessLabel} &middot; {rangeLabel}
        {isManual && <> &middot; Period: {from} to {to}</>}
      </p>
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
