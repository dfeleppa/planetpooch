"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

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

function groupBy(opps: Opportunity[], key: "status" | "source"): GroupedRow[] {
  const map = new Map<string, { count: number; total: number }>();
  for (const o of opps) {
    const label = o[key] || "(none)";
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

export function GhlDataView() {
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ghl/data")
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
        }>;
      })
      .then((d) => setOpportunities(d.opportunities))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  const byStatus = groupBy(opportunities, "status");
  const bySource = groupBy(opportunities, "source");
  const byCampaign = groupByAttribution(opportunities);
  const byMedium = groupByMedium(opportunities);
  const byContent = groupByContent(opportunities);

  return (
    <div className="space-y-6">
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
      <SummaryTable title="By Source" rows={bySource} />
      <SummaryTable title="By Campaign (First Touch)" rows={byCampaign} />
      <SummaryTable title="By Medium (First Touch)" rows={byMedium} />
      <SummaryTable title="By Ad Content (First Touch)" rows={byContent} />
    </div>
  );
}
