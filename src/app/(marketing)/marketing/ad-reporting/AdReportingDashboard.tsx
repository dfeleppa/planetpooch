"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  FacebookCampaignReportTable,
  GoogleCampaignReportTable,
} from "./CampaignReportTables";
import { GoogleLsaLeadReportTable } from "./GoogleLsaLeadReportTable";

type MetricData = {
  metaAdSpend: number | null;
  metaRevenue: number | null;
  googleAdSpend: number | null;
  googleRevenue: number | null;
  googleLsaAdSpend: number | null;
  googleLsaRevenue: number | null;
  metaDataThrough: string | null;
  metaDataComplete: boolean;
};

const EMPTY_METRIC: MetricData = {
  metaAdSpend: null,
  metaRevenue: null,
  googleAdSpend: null,
  googleRevenue: null,
  googleLsaAdSpend: null,
  googleLsaRevenue: null,
  metaDataThrough: null,
  metaDataComplete: false,
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

export function AdReportingDashboard({
  business,
  from,
  to,
  source,
  rangeLabel,
}: {
  business: string;
  from: string;
  to: string;
  source: "all" | "meta" | "google-ads" | "google-lsa";
  rangeLabel: string;
}) {
  const [metric, setMetric] = useState<MetricData>(EMPTY_METRIC);
  const [loadError, setLoadError] = useState(false);

  const [loadedFor, setLoadedFor] = useState("");
  const metricKey = `${business}|${from}|${to}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/finance/aggregated?business=${business}&from=${from}&to=${to}`)
      .then((res) => { if (!res.ok) throw new Error("Report unavailable"); return res.json(); })
      .then((json) => {
        if (cancelled) return;
        if (json.metric) {
          const m = json.metric;
          setMetric({
            metaAdSpend: m.metaAdSpend,
            metaRevenue: m.metaRevenue,
            googleAdSpend: m.googleAdSpend,
            googleRevenue: m.googleRevenue,
            googleLsaAdSpend: m.googleLsaAdSpend,
            googleLsaRevenue: m.googleLsaRevenue,
            metaDataThrough: m.metaDataThrough ?? null,
            metaDataComplete: m.metaDataComplete ?? false,
          });
          setLoadError(false);
          setLoadedFor(metricKey);
        } else {
          setMetric(EMPTY_METRIC);
          setLoadError(true);
          setLoadedFor(metricKey);
        }
      })
      .catch(() => {
        if (!cancelled) { setMetric(EMPTY_METRIC); setLoadError(true); setLoadedFor(metricKey); }
      });

    return () => {
      cancelled = true;
    };
  }, [business, from, to, metricKey]);

  return (
    <>
      {loadedFor === metricKey ? loadError
        ? <Card className="mt-4"><CardContent className="py-6 text-sm text-red-700">Spend and revenue could not be loaded for this range.</CardContent></Card>
        : <AttributionSummary metric={metric} source={source} rangeLabel={rangeLabel} /> :
        <Card className="mt-4"><CardContent className="py-6 text-sm text-gray-500">Loading spend and revenue…</CardContent></Card>}

      <details className="mt-6 rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-gray-800">Show detailed platform campaign reports</summary>
        <div className="space-y-5 border-t border-gray-100 p-4">
          {(source === "all" || source === "meta") && <FacebookCampaignReportTable business={business} from={from} to={to} />}
          {(source === "all" || source === "google-ads") && <GoogleCampaignReportTable business={business} from={from} to={to} />}
          {(source === "all" || source === "google-lsa") && <GoogleLsaLeadReportTable business={business} from={from} to={to} />}
        </div>
      </details>
    </>
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
    { key: "meta", label: "Meta Ads · platform reported", spend: metric.metaAdSpend, revenue: metric.metaRevenue },
    { key: "google-ads", label: "Google Ads", spend: metric.googleAdSpend, revenue: metric.googleRevenue },
    { key: "google-lsa", label: "Google LSA", spend: metric.googleLsaAdSpend, revenue: metric.googleLsaRevenue },
  ].filter((row) => source === "all" || row.key === source);
  return (
    <Card className="mt-6 overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="font-semibold text-gray-900">Revenue and ad spend by source</h3>
          <p className="mt-1 text-xs text-gray-500">
            Meta: platform-reported purchases and spend · Google: completed MoeGo service revenue by sale date · {rangeLabel}
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
            </tbody>
          </table>
        </div>
        {!metric.metaDataComplete && (
          <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
            Meta platform data does not cover every day in this period{metric.metaDataThrough ? ` (latest synced day: ${metric.metaDataThrough})` : ""}. Complete spend, revenue, and ROAS are hidden here; Creative performance may still show available ad-level results.
          </p>
        )}
        {metric.googleAdSpend === null && (source === "all" || source === "google-ads") && (
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-amber-700">
            Source spend is available for the Jan 1 – Sep 5 report. Monthly revenue is dated, but the supplied spend was a period total.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
