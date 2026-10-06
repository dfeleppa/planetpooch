"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";

type Source = "all" | "meta" | "google-ads" | "google-lsa";
type Data = {
  totals: {
    submissions: number;
    attributed: number;
    attributionRate: number;
    selected: number;
    sourceCounts: { meta: number; "google-ads": number; "google-lsa": number; unattributed: number };
  };
  campaigns: Array<{
    source: string; campaignId: string | null; campaignName: string;
    adsetId: string | null; adsetName: string | null; adId: string | null; adName: string | null; leads: number;
  }>;
  leads: Array<{
    id: string; receivedAt: string; customer: string; services: string[]; source: string;
    campaignName: string | null; adsetName: string | null; adName: string | null; syncedToMoego: boolean;
  }>;
};

const SOURCE_LABELS: Record<string, string> = {
  all: "All sources", meta: "Meta", "google-ads": "Google Ads", "google-lsa": "Google LSA", unattributed: "Unattributed",
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "short", timeStyle: "short",
  }).format(new Date(value));
}

export function LeadAttributionDashboard({ from, to, source }: { from: string; to: string; source: Source }) {
  const params = new URLSearchParams({ from, to, source }).toString();
  const [result, setResult] = useState<{ params: string; data: Data | null; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketing/lead-attribution?${params}`)
      .then((response) => {
        if (!response.ok) throw new Error("Lead attribution request failed");
        return response.json();
      })
      .then((json: Data) => { if (!cancelled) setResult({ params, data: json, error: false }); })
      .catch(() => { if (!cancelled) setResult({ params, data: null, error: true }); });
    return () => { cancelled = true; };
  }, [params]);

  const title = source === "all" ? "Website lead attribution" : `${SOURCE_LABELS[source]} lead attribution`;
  const current = result?.params === params ? result : null;
  const data = current?.data;
  const error = current?.error;
  if (error) return <Card className="mt-6"><CardContent className="py-6 text-sm text-red-700">Lead attribution could not be loaded.</CardContent></Card>;
  if (!data) return <Card className="mt-6"><CardContent className="py-6 text-sm text-gray-500">Loading lead attribution…</CardContent></Card>;

  const cards = source === "all"
    ? [
        ["Form submissions", data.totals.submissions],
        ["Campaign attributed", data.totals.attributed],
        ["Meta leads", data.totals.sourceCounts.meta],
        ["Google Ads leads", data.totals.sourceCounts["google-ads"]],
        ["Google LSA leads", data.totals.sourceCounts["google-lsa"]],
      ]
    : [
        [`${SOURCE_LABELS[source]} leads`, data.totals.selected],
        ["All form submissions", data.totals.submissions],
        ["Campaign attributed", data.totals.attributed],
        ["Attribution coverage", `${(data.totals.attributionRate * 100).toFixed(0)}%`],
      ];

  return (
    <section className="mt-4 space-y-4" aria-label={title}>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {cards.map(([label, value]) => (
          <Card key={label}><CardContent className="py-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-gray-900">{value}</p>
          </CardContent></Card>
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="border-b border-gray-200 px-5 py-4"><h4 className="font-medium text-gray-900">Leads by campaign and ad</h4></div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>
                <th className="px-5 py-3 font-medium">Source</th><th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 font-medium">Ad set</th><th className="px-5 py-3 font-medium">Ad</th>
                <th className="px-5 py-3 text-right font-medium">Leads</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.campaigns.map((row) => (
                  <tr key={[row.source, row.campaignId, row.adsetId, row.adId].join("|")}>
                    <td className="px-5 py-3 font-medium">{SOURCE_LABELS[row.source] || row.source}</td>
                    <td className="max-w-64 px-5 py-3"><div>{row.campaignName}</div>{row.campaignId && row.campaignName !== row.campaignId && <div className="mt-1 break-all text-xs text-gray-400">{row.campaignId}</div>}</td>
                    <td className="max-w-56 px-5 py-3">{row.adsetName || row.adsetId || "—"}</td>
                    <td className="max-w-56 px-5 py-3">{row.adName || row.adId || "—"}</td>
                    <td className="px-5 py-3 text-right text-lg font-semibold">{row.leads}</td>
                  </tr>
                ))}
                {data.campaigns.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-gray-500">No submitted leads for this source and date range.</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <details>
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-gray-800">Show recent submitted leads ({data.leads.length})</summary>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500"><tr>
                <th className="px-5 py-3 font-medium">Received</th><th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Source</th><th className="px-5 py-3 font-medium">Campaign</th>
                <th className="px-5 py-3 font-medium">Services</th><th className="px-5 py-3 font-medium">MoeGo</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">
                {data.leads.map((lead) => (
                  <tr key={lead.id}>
                    <td className="whitespace-nowrap px-5 py-3">{formatTime(lead.receivedAt)}</td>
                    <td className="px-5 py-3 font-medium text-gray-900">{lead.customer}</td>
                    <td className="px-5 py-3">{SOURCE_LABELS[lead.source] || lead.source}</td>
                    <td className="max-w-64 px-5 py-3">{lead.campaignName || "—"}{lead.adName && <div className="mt-1 text-xs text-gray-500">{lead.adName}</div>}</td>
                    <td className="px-5 py-3">{lead.services.join(", ") || "—"}</td>
                    <td className="px-5 py-3">{lead.syncedToMoego ? "Synced" : "Not confirmed"}</td>
                  </tr>
                ))}
                {data.leads.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-500">No submitted leads for this source and date range.</td></tr>}
              </tbody>
            </table>
          </div>
          </details>
        </CardContent>
      </Card>
    </section>
  );
}
