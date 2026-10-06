"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  FacebookCampaignReportTable,
  GoogleCampaignReportTable,
} from "./CampaignReportTables";
import { GoogleLsaLeadReportTable } from "./GoogleLsaLeadReportTable";
import { MetaSyncRangeButton } from "./MetaSyncRangeButton";

type MetricData = {
  metaAdSpend: number | null;
  metaRevenue: number | null;
  googleAdSpend: number | null;
  googleRevenue: number | null;
  googleLsaAdSpend: number | null;
  googleLsaRevenue: number | null;
  unattributedRevenue: number | null;
  totalMoegoRevenue: number | null;
  metaDataThrough: string | null;
  metaDataComplete: boolean;
  metaSyncedAt: string | null;
  moegoSyncedAt: string | null;
  moegoCursorThrough: string | null;
  moegoDataAvailable: boolean;
  googleImportedAt: string | null;
  googleLsaImportedAt: string | null;
};

const EMPTY_METRIC: MetricData = {
  metaAdSpend: null,
  metaRevenue: null,
  googleAdSpend: null,
  googleRevenue: null,
  googleLsaAdSpend: null,
  googleLsaRevenue: null,
  unattributedRevenue: null,
  totalMoegoRevenue: null,
  metaDataThrough: null,
  metaDataComplete: false,
  metaSyncedAt: null,
  moegoSyncedAt: null,
  moegoCursorThrough: null,
  moegoDataAvailable: false,
  googleImportedAt: null,
  googleLsaImportedAt: null,
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
    fetch(`/api/marketing/live-report?from=${from}&to=${to}`, { cache: "no-store" })
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
            unattributedRevenue: m.unattributedRevenue,
            totalMoegoRevenue: m.totalMoegoRevenue,
            metaDataThrough: m.metaDataThrough ?? null,
            metaDataComplete: m.metaDataComplete ?? false,
            metaSyncedAt: m.metaSyncedAt ?? null,
            moegoSyncedAt: m.moegoSyncedAt ?? null,
            moegoCursorThrough: m.moegoCursorThrough ?? null,
            moegoDataAvailable: m.moegoDataAvailable ?? false,
            googleImportedAt: m.googleImportedAt ?? null,
            googleLsaImportedAt: m.googleLsaImportedAt ?? null,
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

      {(source === "all" || source === "meta") && <MetaSyncRangeButton from={from} to={to} />}

      <details className="mt-6 rounded-xl border border-gray-200 bg-white">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-gray-800">Show detailed platform campaign reports</summary>
        <div className="space-y-5 border-t border-gray-100 p-4">
          {([{"key":"pet-resort","label":"Pet Resort"},{"key":"mobile-grooming","label":"Mobile Grooming"}] as const).map((division) => <section key={division.key} className="space-y-5">
            <h4 className="font-semibold text-gray-900">{division.label}</h4>
            {(source === "all" || source === "meta") && <FacebookCampaignReportTable business={division.key} from={from} to={to} />}
            {(source === "all" || source === "google-ads") && <GoogleCampaignReportTable business={division.key} from={from} to={to} />}
            {(source === "all" || source === "google-lsa") && <GoogleLsaLeadReportTable business={division.key} from={from} to={to} />}
          </section>)}
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
    { key: "meta", label: "Meta Ads · connected", spend: metric.metaAdSpend, revenue: metric.metaRevenue },
    { key: "google-ads", label: "Google Ads · CSV import", spend: metric.googleAdSpend, revenue: metric.googleRevenue },
    { key: "google-lsa", label: "Google LSA · CSV import", spend: metric.googleLsaAdSpend, revenue: metric.googleLsaRevenue },
  ].filter((row) => source === "all" || row.key === source);
  return (
    <Card className="mt-6 overflow-hidden">
      <CardContent className="p-0">
        <div className="border-b border-gray-200 px-5 py-4">
          <h3 className="font-semibold text-gray-900">Observed MoeGo revenue and ad spend by source</h3>
          <p className="mt-1 text-xs text-gray-500">
            Net paid orders sold in {rangeLabel}. A source is assigned only when the customer has an earlier, linked website form with that source. This is observed revenue after a form, not proof the ad caused the purchase.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-5 py-3 font-medium">Source</th>
                <th className="px-5 py-3 text-right font-medium">Ad spend</th>
                <th className="px-5 py-3 text-right font-medium">Net paid after form</th>
                <th className="px-5 py-3 text-right font-medium">Observed return</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => {
                const roas = row.spend && row.revenue !== null && metric.moegoDataAvailable ? row.revenue / row.spend : null;
                return (
                  <tr key={row.key}>
                    <td className="px-5 py-3 font-medium text-gray-900">{row.label}</td>
                    <td className="px-5 py-3 text-right">{formatDollars(cents(row.spend))}</td>
                    <td className="px-5 py-3 text-right">{formatDollars(cents(row.revenue))}</td>
                    <td className="px-5 py-3 text-right font-medium">{formatRatio(roas)}</td>
                  </tr>
                );
              })}
              {source === "all" && <tr className="bg-gray-50">
                <td className="px-5 py-3 font-medium text-gray-900">Unattributed MoeGo revenue</td>
                <td className="px-5 py-3 text-right">—</td>
                <td className="px-5 py-3 text-right">{formatDollars(cents(metric.unattributedRevenue))}</td>
                <td className="px-5 py-3 text-right">—</td>
              </tr>}
            </tbody>
          </table>
        </div>
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-600">
          MoeGo net paid for Pet Resort and Mobile Grooming: {formatDollars(cents(metric.totalMoegoRevenue))}.
          {metric.moegoSyncedAt ? ` Orders last updated ${new Date(metric.moegoSyncedAt).toLocaleString()}.` : " No order rows have been synced."}
          {metric.moegoCursorThrough ? ` Order sync cursor: ${new Date(metric.moegoCursorThrough).toLocaleString()}.` : ""}
          {metric.metaSyncedAt ? ` Meta last synced ${new Date(metric.metaSyncedAt).toLocaleString()}.` : ""}
          {metric.googleImportedAt ? ` Google Ads import saved ${new Date(metric.googleImportedAt).toLocaleString()}.` : ""}
          {metric.googleLsaImportedAt ? ` Google LSA import saved ${new Date(metric.googleLsaImportedAt).toLocaleString()}.` : ""}
        </p>
        {!metric.moegoDataAvailable && (
          <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
            MoeGo order sync has not been verified within the last 48 hours. Revenue and observed return are hidden until current order data is available.
          </p>
        )}
        {!metric.metaDataComplete && (source === "all" || source === "meta") && (
          <p className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
            Meta insights do not cover the full selected period{metric.metaDataThrough ? ` (latest available day: ${metric.metaDataThrough})` : ""}. Full-period spend and observed return are hidden; sync or backfill Meta for this range.
          </p>
        )}
        {metric.googleAdSpend === null && (source === "all" || source === "google-ads") && (
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-amber-700">
            Google Ads spend needs a CSV import for this exact date range. A previously imported period total is not reused for different dates.
          </p>
        )}
        {metric.googleLsaAdSpend === null && (source === "all" || source === "google-lsa") && (
          <p className="border-t border-gray-100 px-5 py-3 text-xs text-amber-700">
            Google LSA spend needs a lead CSV import for this exact date range.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
