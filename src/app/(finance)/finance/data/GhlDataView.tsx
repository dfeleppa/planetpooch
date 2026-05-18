"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

type Attribution = {
  adSource?: string;
  utmCampaign?: string;
  utmCampaignId?: string;
  utmContent?: string;
  utmMedium?: string;
  utmSessionSource?: string;
  utmSource?: string;
  utmAdId?: string;
  mediumId?: string;
  isFirst?: boolean;
  isLast?: boolean;
};

type Opportunity = {
  id: string;
  name: string;
  monetaryValue: number;
  status: string;
  source: string;
  createdAt: string;
  attributions: Attribution[];
};

type GroupedRow = {
  label: string;
  count: number;
  totalValue: number;
  avgValue: number;
};

function groupByStatus(opps: Opportunity[]): GroupedRow[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const o of opps) {
    const label = o.status || "(none)";
    const entry = map.get(label) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += o.monetaryValue;
    map.set(label, entry);
  }
  return Array.from(map.entries())
    .map(([label, { count, total }]) => ({
      label,
      count,
      totalValue: total,
      avgValue: count > 0 ? total / count : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

function isMeta(source: string): boolean {
  return source.toLowerCase() === "meta ads";
}

type SourceGroup = {
  label: string;
  count: number;
  totalValue: number;
  avgValue: number;
  children?: GroupedRow[];
};

function groupBySource(opps: Opportunity[]): SourceGroup[] {
  let metaCount = 0;
  let metaTotal = 0;
  const otherMap = new Map<string, { count: number; total: number }>();
  let otherCount = 0;
  let otherTotal = 0;

  for (const o of opps) {
    const src = o.source || "(none)";
    if (isMeta(src)) {
      metaCount++;
      metaTotal += o.monetaryValue;
    } else {
      otherCount++;
      otherTotal += o.monetaryValue;
      const entry = otherMap.get(src) ?? { count: 0, total: 0 };
      entry.count++;
      entry.total += o.monetaryValue;
      otherMap.set(src, entry);
    }
  }

  const otherChildren = Array.from(otherMap.entries())
    .map(([label, { count, total }]) => ({
      label,
      count,
      totalValue: total,
      avgValue: count > 0 ? total / count : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);

  const groups: SourceGroup[] = [];

  groups.push({
    label: "Meta Ads",
    count: metaCount,
    totalValue: metaTotal,
    avgValue: metaCount > 0 ? metaTotal / metaCount : 0,
  });

  if (otherCount > 0) {
    groups.push({
      label: "Other",
      count: otherCount,
      totalValue: otherTotal,
      avgValue: otherCount > 0 ? otherTotal / otherCount : 0,
      children: otherChildren,
    });
  }

  return groups.sort((a, b) => b.totalValue - a.totalValue);
}

function groupByAttribution(opps: Opportunity[]): GroupedRow[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const o of opps) {
    if (o.attributions.length === 0) {
      const entry = map.get("(no attribution)") ?? { count: 0, total: 0 };
      entry.count++;
      entry.total += o.monetaryValue;
      map.set("(no attribution)", entry);
      continue;
    }
    const first = o.attributions.find((a) => a.isFirst) ?? o.attributions[0];
    const label = first.utmCampaign || first.utmSource || first.adSource || "(unknown)";
    const entry = map.get(label) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += o.monetaryValue;
    map.set(label, entry);
  }
  return Array.from(map.entries())
    .map(([label, { count, total }]) => ({
      label,
      count,
      totalValue: total,
      avgValue: count > 0 ? total / count : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

function groupByMedium(opps: Opportunity[]): GroupedRow[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const o of opps) {
    if (o.attributions.length === 0) {
      const entry = map.get("(no attribution)") ?? { count: 0, total: 0 };
      entry.count++;
      entry.total += o.monetaryValue;
      map.set("(no attribution)", entry);
      continue;
    }
    const first = o.attributions.find((a) => a.isFirst) ?? o.attributions[0];
    const label = first.utmMedium || first.utmSessionSource || "(unknown)";
    const entry = map.get(label) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += o.monetaryValue;
    map.set(label, entry);
  }
  return Array.from(map.entries())
    .map(([label, { count, total }]) => ({
      label,
      count,
      totalValue: total,
      avgValue: count > 0 ? total / count : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

function groupByContent(opps: Opportunity[]): GroupedRow[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const o of opps) {
    if (o.attributions.length === 0) continue;
    const first = o.attributions.find((a) => a.isFirst) ?? o.attributions[0];
    const label = first.utmContent;
    if (!label) continue;
    const entry = map.get(label) ?? { count: 0, total: 0 };
    entry.count++;
    entry.total += o.monetaryValue;
    map.set(label, entry);
  }
  return Array.from(map.entries())
    .map(([label, { count, total }]) => ({
      label,
      count,
      totalValue: total,
      avgValue: count > 0 ? total / count : 0,
    }))
    .sort((a, b) => b.totalValue - a.totalValue);
}

const fmt = (v: number) =>
  v.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

function SummaryTable({
  title,
  rows,
}: {
  title: string;
  rows: GroupedRow[];
}) {
  if (rows.length === 0) return null;
  const grandTotal = rows.reduce((s, r) => s + r.totalValue, 0);

  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">
          {title}
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium text-right">Count</th>
              <th className="px-4 py-2 font-medium text-right">Total Value</th>
              <th className="px-4 py-2 font-medium text-right">Avg Value</th>
              <th className="px-4 py-2 font-medium text-right">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b last:border-0 hover:bg-gray-50">
                <td className="px-4 py-2 font-medium text-gray-900">
                  {r.label}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {r.count.toLocaleString()}
                </td>
                <td className="px-4 py-2 text-right text-gray-900">
                  {fmt(r.totalValue)}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {fmt(r.avgValue)}
                </td>
                <td className="px-4 py-2 text-right text-gray-600">
                  {grandTotal > 0
                    ? ((r.totalValue / grandTotal) * 100).toFixed(1) + "%"
                    : "0%"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right">
                {rows.reduce((s, r) => s + r.count, 0).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right">{fmt(grandTotal)}</td>
              <td className="px-4 py-2 text-right">
                {fmt(
                  rows.reduce((s, r) => s + r.count, 0) > 0
                    ? grandTotal / rows.reduce((s, r) => s + r.count, 0)
                    : 0
                )}
              </td>
              <td className="px-4 py-2 text-right">100%</td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

function SourceTable({ groups }: { groups: SourceGroup[] }) {
  const [otherExpanded, setOtherExpanded] = useState(false);
  const grandTotal = groups.reduce((s, g) => s + g.totalValue, 0);

  return (
    <Card>
      <CardContent className="p-0">
        <h3 className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">
          By Source
        </h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="px-4 py-2 font-medium">Label</th>
              <th className="px-4 py-2 font-medium text-right">Count</th>
              <th className="px-4 py-2 font-medium text-right">Total Value</th>
              <th className="px-4 py-2 font-medium text-right">Avg Value</th>
              <th className="px-4 py-2 font-medium text-right">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <>
                <tr
                  key={g.label}
                  className={
                    "border-b last:border-0 hover:bg-gray-50" +
                    (g.children ? " cursor-pointer" : "")
                  }
                  onClick={
                    g.children
                      ? () => setOtherExpanded((p) => !p)
                      : undefined
                  }
                >
                  <td className="px-4 py-2 font-medium text-gray-900">
                    {g.children ? (
                      <span className="inline-flex items-center gap-1">
                        <span className="text-xs text-gray-400">
                          {otherExpanded ? "▼" : "▶"}
                        </span>
                        {g.label}
                      </span>
                    ) : (
                      g.label
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {g.count.toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-900">
                    {fmt(g.totalValue)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {fmt(g.avgValue)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {grandTotal > 0
                      ? ((g.totalValue / grandTotal) * 100).toFixed(1) + "%"
                      : "0%"}
                  </td>
                </tr>
                {g.children &&
                  otherExpanded &&
                  g.children.map((c) => (
                    <tr
                      key={c.label}
                      className="border-b last:border-0 bg-gray-50/50 hover:bg-gray-100"
                    >
                      <td className="pl-10 pr-4 py-1.5 text-gray-600">
                        {c.label}
                      </td>
                      <td className="px-4 py-1.5 text-right text-gray-500">
                        {c.count.toLocaleString()}
                      </td>
                      <td className="px-4 py-1.5 text-right text-gray-700">
                        {fmt(c.totalValue)}
                      </td>
                      <td className="px-4 py-1.5 text-right text-gray-500">
                        {fmt(c.avgValue)}
                      </td>
                      <td className="px-4 py-1.5 text-right text-gray-500">
                        {grandTotal > 0
                          ? ((c.totalValue / grandTotal) * 100).toFixed(1) + "%"
                          : "0%"}
                      </td>
                    </tr>
                  ))}
              </>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-4 py-2">Total</td>
              <td className="px-4 py-2 text-right">
                {groups.reduce((s, g) => s + g.count, 0).toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right">{fmt(grandTotal)}</td>
              <td className="px-4 py-2 text-right">
                {fmt(
                  groups.reduce((s, g) => s + g.count, 0) > 0
                    ? grandTotal / groups.reduce((s, g) => s + g.count, 0)
                    : 0
                )}
              </td>
              <td className="px-4 py-2 text-right">100%</td>
            </tr>
          </tfoot>
        </table>
      </CardContent>
    </Card>
  );
}

export function GhlDataView() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [services, setServices] = useState<Record<string, string>>({});

  const loadServices = () =>
    fetch("/api/ghl/data/service")
      .then((r) => r.json())
      .then((d: { services: Record<string, string> }) =>
        setServices(d.services),
      )
      .catch(() => {});

  const load = (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);

    const url = refresh ? "/api/ghl/data?refresh=1" : "/api/ghl/data";
    fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(
            (body as { error?: string }).error ?? `HTTP ${res.status}`
          );
        }
        return res.json() as Promise<{
          opportunities: Opportunity[];
          total: number;
          cached?: boolean;
          cachedAt?: string;
        }>;
      })
      .then((d) => {
        setOpportunities(d.opportunities);
        setCachedAt(d.cachedAt ?? null);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };

  useEffect(() => { load(); loadServices(); }, []);

  const updateService = (opportunityId: string, service: string | null) => {
    setServices((prev) => {
      const next = { ...prev };
      if (service) next[opportunityId] = service;
      else delete next[opportunityId];
      return next;
    });
    fetch("/api/ghl/data/service", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunityId, service }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-gray-500">
        Loading GHL opportunity data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
        {error}
      </div>
    );
  }

  const totalValue = opportunities.reduce((s, o) => s + o.monetaryValue, 0);

  const byStatus = groupByStatus(opportunities);
  const sourceGroups = groupBySource(opportunities);
  const byCampaign = groupByAttribution(opportunities);
  const byMedium = groupByMedium(opportunities);
  const byContent = groupByContent(opportunities);

  return (
    <div className="space-y-6">
      {/* Cache info + refresh */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400">
          {cachedAt
            ? `Cached ${new Date(cachedAt).toLocaleString()}`
            : "Live data"}
        </p>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Opportunities
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {opportunities.length.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Total Monetary Value
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {fmt(totalValue)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Avg Value per Opportunity
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {fmt(opportunities.length > 0 ? totalValue / opportunities.length : 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown tables */}
      <SummaryTable title="By Status" rows={byStatus} />
      <SourceTable groups={sourceGroups} />
      <SummaryTable title="By Campaign (First Touch)" rows={byCampaign} />
      <SummaryTable title="By Medium (First Touch)" rows={byMedium} />
      <SummaryTable title="By Ad Content (First Touch)" rows={byContent} />

      {/* Per-opportunity table with Service dropdown */}
      <Card>
        <CardContent className="p-0">
          <h3 className="text-sm font-semibold text-gray-700 px-4 pt-4 pb-2">
            Opportunities
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Source</th>
                  <th className="px-4 py-2 font-medium text-right">Value</th>
                  <th className="px-4 py-2 font-medium">Created</th>
                  <th className="px-4 py-2 font-medium">Service</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-2 font-medium text-gray-900 max-w-[200px] truncate">
                      {o.name}
                    </td>
                    <td className="px-4 py-2 text-gray-600">{o.status || "—"}</td>
                    <td className="px-4 py-2 text-gray-600">{o.source || "—"}</td>
                    <td className="px-4 py-2 text-right text-gray-900">
                      {fmt(o.monetaryValue)}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {new Date(o.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">
                      <select
                        value={services[o.id] ?? ""}
                        onChange={(e) =>
                          updateService(o.id, e.target.value || null)
                        }
                        className="rounded border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">—</option>
                        <option value="mobile">Mobile</option>
                        <option value="resort">Resort</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
