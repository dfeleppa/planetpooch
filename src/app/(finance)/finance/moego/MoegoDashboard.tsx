"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/Tabs";
import { RevenueChart } from "./RevenueChart";
import {
  chartPresetRange,
  type ChartRangePreset,
} from "@/lib/moego/chart-date-range";

type BusinessOption = { id: string; label: string };

type MoegoMetrics = {
  lastSync: {
    customer: string | null;
    order: string | null;
    lead: string | null;
  };
};

/// Quick ranges fill the chart's global From/To pickers.
const QUICK_RANGES = [
  { value: "last-week", label: "Last week" },
  { value: "last-month", label: "Last month" },
  { value: "last-year", label: "Last year" },
  { value: "7-days", label: "Last 7 days" },
  { value: "30-days", label: "Last 30 days" },
  { value: "90-days", label: "Last 90 days" },
  { value: "year-to-date", label: "Year to date" },
  { value: "1-year", label: "Last 1 year" },
  { value: "2-years", label: "Last 2 years" },
  { value: "all", label: "All time" },
] satisfies { value: ChartRangePreset; label: string }[];

function relative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

type DiscoveredCompany = {
  id: string;
  name?: string;
  country?: string;};

export function MoegoDashboard({ businesses, initialRange }: {
  businesses: BusinessOption[];
  initialRange?: { from: string; to: string };
}) {
  // Selected business. No combined view — every panel is scoped to one
  // business at a time.
  const [business, setBusiness] = useState<string>(businesses[0]?.id ?? "");

  // Page-wide date range drives the revenue/profit chart.
  const defaultRange = useMemo(() => chartPresetRange("30-days"), []);
  const today = defaultRange.to;
  const [from, setFrom] = useState<string>(initialRange?.from ?? defaultRange.from);
  const [to, setTo] = useState<string>(initialRange?.to ?? today);
  const [quickRange, setQuickRange] = useState<ChartRangePreset | "">(initialRange ? "" : "30-days");

  const [metrics, setMetrics] = useState<MoegoMetrics | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<DiscoveredCompany[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);
  /// Range to pass to /api/finance/moego/reset. "" = full backfill.
  const [resyncDays, setResyncDays] = useState<string>("90");
  const [resyncYear, setResyncYear] = useState<string>(
    String(new Date().getUTCFullYear())
  );

  const load = useCallback(
    async (fromStr: string, toStr: string, businessStr: string) => {
      if (!businessStr) {
        setMetrics(null);
        return;
      }
      setError(null);
      try {
        const res = await fetch(
          `/api/finance/moego/metrics?from=${fromStr}&to=${toStr}&business=${encodeURIComponent(businessStr)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        setMetrics((await res.json()) as MoegoMetrics);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load metrics");
      }
    },
    []
  );

  useEffect(() => {
    void load(from, to, business);
  }, [from, to, business, load]);

  function applyQuickRange(preset: ChartRangePreset) {
    const range = chartPresetRange(preset);
    setQuickRange(preset);
    setFrom(range.from);
    setTo(range.to);
  }

  /**
   * Poll a sync endpoint until it reports caughtUp. Shared between the
   * normal /sync flow and the year-bounded /sync-year flow.
   */
  async function pollSync(url: string, label: string) {
    setSyncing(true);
    setError(null);
    setSyncProgress(null);
    let totalChunks = 0;
    let totalCustomers = 0;
    let totalOrders = 0;
    let totalLeads = 0;
    const skippedAll = new Set<string>();

    // Server processes ~30-day slices within its runtime budget and
    // returns `caughtUp: false` if there's more history to pull. Loop
    // calls until we drain the backfill — at most a handful of round
    // trips even for a 2-year history.
    try {
      for (let i = 0; i < 60; i++) {
        const res = await fetch(url, { method: "POST" });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          caughtUp: boolean;
          chunks: number;
          customers: { upserted: number };
          orders: { upserted: number };
          leads: { upserted: number };
          skipped?: string[];
        };
        totalChunks += data.chunks;
        totalCustomers += data.customers.upserted;
        totalOrders += data.orders.upserted;
        totalLeads += data.leads.upserted;
        for (const s of data.skipped ?? []) skippedAll.add(s);
        const skippedSuffix =
          skippedAll.size > 0
            ? ` · skipped (no API scope): ${Array.from(skippedAll).join(", ")}`
            : "";
        setSyncProgress(
          `${label} · ${totalChunks} chunks · ${totalCustomers} customers, ${totalOrders} orders, ${totalLeads} leads upserted${skippedSuffix}`
        );
        if (data.caughtUp) break;
      }
      await load(from, to, business);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function runSync() {
    await pollSync("/api/finance/moego/sync", "Incremental");
  }

  async function runYearSync(year: string) {
    await pollSync(`/api/finance/moego/sync-year?year=${year}`, `Year ${year}`);
  }

  async function discoverCompanies() {
    setDiscovering(true);
    setError(null);
    setCompanies(null);
    try {
      const res = await fetch("/api/finance/moego/discover", {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { companies: DiscoveredCompany[] };
      setCompanies(data.companies);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Discovery failed");
    } finally {
      setDiscovering(false);
    }
  }

  return (
    <div>
      {businesses.length > 1 ? (
        <Tabs
          tabs={businesses.map((b) => ({ id: b.id, label: b.label }))}
          activeTab={business}
          onChange={setBusiness}
          className="mb-6"
        />
      ) : businesses.length === 0 ? (
        <div className="mb-6 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          No MoeGo businesses found yet. Run a sync below to populate order data.
        </div>
      ) : null}
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">
              From
            </span>
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setQuickRange("");
                setFrom(e.target.value);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">
              To
            </span>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => {
                setQuickRange("");
                setTo(e.target.value);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-gray-700 uppercase tracking-wide">
              Quick
            </span>
            <select
              aria-label="Quick range"
              value={quickRange}
              onChange={(e) => {
                const preset = e.target.value as ChartRangePreset | "";
                if (preset) applyQuickRange(preset);
              }}
              className="min-w-40 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select range…</option>
              {QUICK_RANGES.map((range) => (
                <option key={range.value} value={range.value}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 mb-6">
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>
            customers synced {relative(metrics?.lastSync.customer ?? null)} ·
            orders {relative(metrics?.lastSync.order ?? null)} · leads{" "}
            {relative(metrics?.lastSync.lead ?? null)}
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={runSync}
            disabled={syncing}
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
          <select
            value={resyncDays}
            onChange={(e) => setResyncDays(e.target.value)}
            disabled={syncing}
            className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
          >
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="180">Last 180 days</option>
            <option value="365">Last 1 year</option>
            <option value="730">Last 2 years</option>
            <option value="">From scratch</option>
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const label =
                resyncDays === ""
                  ? "every customer, order, and lead from MoeGo (slow for big histories)"
                  : `the last ${resyncDays} days of customers, orders, and leads`;
              if (
                !confirm(
                  `Resync ${label}? Existing rows are overwritten in place (safe).`
                )
              )
                return;
              const url = resyncDays
                ? `/api/finance/moego/reset?days=${resyncDays}`
                : "/api/finance/moego/reset";
              const res = await fetch(url, { method: "POST" });
              if (res.ok) {
                await runSync();
              } else {
                const body = (await res
                  .json()
                  .catch(() => ({}))) as { error?: string };
                setError(body.error ?? `Reset failed: HTTP ${res.status}`);
              }
            }}
            disabled={syncing}
          >
            Resync window
          </Button>
          <select
            value={resyncYear}
            onChange={(e) => setResyncYear(e.target.value)}
            disabled={syncing}
            className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white"
          >
            {(() => {
              const current = new Date().getUTCFullYear();
              const years: number[] = [];
              for (let y = current; y >= 2020; y--) years.push(y);
              return years.map((y) => (
                <option key={y} value={String(y)}>
                  Year {y}
                </option>
              ));
            })()}
          </select>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (
                !confirm(
                  `Sync only customers, orders, and leads updated during ${resyncYear} (Jan 1 – Dec 31). Existing rows are overwritten in place (safe).`
                )
              )
                return;
              await runYearSync(resyncYear);
            }}
            disabled={syncing}
          >
            Sync year
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={discoverCompanies}
            disabled={discovering}
          >
            {discovering ? "Looking…" : "Find company ID"}
          </Button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {syncProgress && (
        <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-xs text-gray-600">
          {syncing ? "Syncing… " : "Sync complete. "}
          {syncProgress}
        </div>
      )}

      {companies && (
        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-900">
          <p className="font-medium mb-2">
            Set <code className="px-1 bg-white rounded">MOEGO_COMPANY_ID</code>{" "}
            to one of these (then redeploy):
          </p>
          {companies.length === 0 ? (
            <p>No companies returned — check that the API key is valid.</p>
          ) : (
            <ul className="space-y-1">
              {companies.map((c) => (
                <li key={c.id} className="font-mono text-xs">
                  <span className="font-semibold">{c.id}</span>
                  {c.name ? ` — ${c.name}` : ""}
                  {c.country ? ` (${c.country})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}


      <div className="mb-6">
        <RevenueChart from={from} to={to} business={business} />
      </div>


    </div>
  );
}
