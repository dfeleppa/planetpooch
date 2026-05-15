"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type LeadSourceRow = {
  source: string;
  customers: number;
  revenueCents: number;
  avgLtvCents: number;
};

type MoegoMetrics = {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  newCustomers: number;
  cohortRevenueCents: number;
  avgLtvCents: number;
  allTimeAvgLtvCents: number;
  totalCustomers: number;
  metaSpendCents: number;
  cacCents: number;
  leadSources: LeadSourceRow[];
  lastSync: {
    customer: string | null;
    order: string | null;
    lead: string | null;
  };
};

const WINDOW_OPTIONS = [7, 30, 90, 365] as const;
type WindowDays = (typeof WINDOW_OPTIONS)[number];

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

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
  country?: string;
};

export function MoegoDashboard() {
  const [days, setDays] = useState<WindowDays>(30);
  const [metrics, setMetrics] = useState<MoegoMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<DiscoveredCompany[] | null>(null);
  const [discovering, setDiscovering] = useState(false);
  const [syncProgress, setSyncProgress] = useState<string | null>(null);

  const load = useCallback(async (window: WindowDays) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/moego/metrics?days=${window}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setMetrics((await res.json()) as MoegoMetrics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  async function runSync() {
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
      for (let i = 0; i < 30; i++) {
        const res = await fetch("/api/finance/moego/sync", { method: "POST" });
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
          `${totalChunks} chunks · ${totalCustomers} customers, ${totalOrders} orders, ${totalLeads} leads upserted${skippedSuffix}`
        );
        if (data.caughtUp) break;
      }
      await load(days);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {WINDOW_OPTIONS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                days === w
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              {w === 365 ? "1y" : `${w}d`}
            </button>
          ))}
        </div>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              New Customers
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {loading ? "—" : metrics?.newCustomers ?? 0}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              total: {metrics?.totalCustomers ?? 0}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Avg LTV (cohort)
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {loading || !metrics ? "—" : dollars(metrics.avgLtvCents)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              all-time:{" "}
              {metrics ? dollars(metrics.allTimeAvgLtvCents) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              CAC (Meta blended)
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {loading || !metrics ? "—" : dollars(metrics.cacCents)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Meta spend:{" "}
              {metrics ? dollars(metrics.metaSpendCents) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Cohort Revenue
            </p>
            <p className="text-3xl font-bold text-gray-900 mt-1">
              {loading || !metrics ? "—" : dollars(metrics.cohortRevenueCents)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              paid from new-customer orders
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">
            Lead source breakdown
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Customers acquired in the last {days} days,
            grouped by MoeGo lead source. Revenue is paidAmount across all
            orders from those customers.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
          ) : !metrics || metrics.leadSources.length === 0 ? (
            <p className="text-sm text-gray-400 py-6 text-center">
              No customers in this window yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                  <th className="py-2 font-medium">Source</th>
                  <th className="py-2 font-medium text-right">Customers</th>
                  <th className="py-2 font-medium text-right">Revenue</th>
                  <th className="py-2 font-medium text-right">Avg LTV</th>
                </tr>
              </thead>
              <tbody>
                {metrics.leadSources.map((row) => (
                  <tr
                    key={row.source}
                    className="border-b border-gray-100 last:border-b-0"
                  >
                    <td className="py-2 text-gray-900">{row.source}</td>
                    <td className="py-2 text-right tabular-nums text-gray-900">
                      {row.customers}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-700">
                      {dollars(row.revenueCents)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-gray-700">
                      {dollars(row.avgLtvCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
