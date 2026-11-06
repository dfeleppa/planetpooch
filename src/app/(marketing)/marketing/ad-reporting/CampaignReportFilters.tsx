"use client";

import { BUSINESSES, SERVICES, type ReportScope } from "@/lib/marketing/report-scope";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import type { CompareMode, ReportSource } from "./report-range";

const SOURCES: { value: ReportSource; label: string }[] = [
  { value: "all", label: "All sources" },
  { value: "meta", label: "Meta" },
  { value: "google-ads", label: "Google Ads" },
  { value: "google-lsa", label: "Google LSA" },
];

export function CampaignReportFilters({ from, to, source, days, comparison, scope, view = "results" }: {
  from: string; to: string; source: ReportSource; days: number | null;
  scope: ReportScope; view?: string;
  comparison: { mode: CompareMode; from: string; to: string } | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(from);
  const [endDate, setEndDate] = useState(to);

  const [compareMode, setCompareMode] = useState<CompareMode>(comparison?.mode ?? "none");
  const [compareFrom, setCompareFrom] = useState(comparison?.from ?? "");
  const [compareTo, setCompareTo] = useState(comparison?.to ?? "");

  function navigate(next: { business?: string; service?: string; days?: number; from?: string; to?: string; source?: ReportSource; compare?: CompareMode; compareFrom?: string; compareTo?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("campaign");
    params.delete("days"); params.delete("from"); params.delete("to");
    params.set("business", next.business ?? scope.business);
    params.set("service", next.service ?? scope.service);
    const selectedSource = next.source ?? source;
    params.set("source", selectedSource);
    if (next.from && next.to) {
      params.set("from", next.from);
      params.set("to", next.to);
    } else if (next.days && next.days !== 30) {
      params.set("days", String(next.days));
    }
    const mode = next.compare ?? comparison?.mode ?? "none";
    params.delete("compare"); params.delete("compareFrom"); params.delete("compareTo");
    if (mode !== "none") {
      params.set("compare", mode);
      if (mode === "custom") {
        params.set("compareFrom", next.compareFrom ?? comparison?.from ?? "");
        params.set("compareTo", next.compareTo ?? comparison?.to ?? "");
      }
    }
    startTransition(() => router.push(`/marketing${params.size ? `?${params}` : ""}`, { scroll: false }));
  }

  return <div className={`pp-report-filters mb-4 rounded-xl border border-gray-200 bg-white p-4 ${pending ? "opacity-60" : ""}`}>
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Date range</p>
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1" aria-label="Date range presets">
          {[7, 30, 90].map((value) => <button key={value} type="button" aria-pressed={days === value}
            onClick={() => { setStartDate(""); setEndDate(""); navigate({ days: value }); }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${days === value ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
            {value} days
          </button>)}
        </div>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (startDate && endDate && startDate <= endDate) navigate({ from: startDate, to: endDate });
      }}>
        <label className="text-xs font-medium text-gray-600">From
          <input aria-label="From date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <label className="text-xs font-medium text-gray-600">To
          <input aria-label="To date" type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} required
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <button type="submit" disabled={pending || !startDate || !endDate || startDate > endDate}
          className="pp-btn pp-btn-primary disabled:opacity-40">Apply dates</button>
      </form>
      {view !== "creatives" && <label className="text-xs font-medium text-gray-600">Lead source
        <select aria-label="Lead source" value={source} onChange={(event) => navigate(days
          ? { days, source: event.target.value as ReportSource }
          : { from, to, source: event.target.value as ReportSource })}
          className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
          {SOURCES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>}
      {[{ label: "Business", key: "business", options: BUSINESSES }, { label: "Service", key: "service", options: SERVICES }].map(({label, key, options}) => <label key={key} className="text-xs font-medium text-gray-600">{label}<select aria-label={label} value={scope[key as keyof ReportScope]} disabled={pending} onChange={(event) => navigate({ ...(days ? { days } : { from, to }), [key]: event.target.value })} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">{options.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>)}
    </div>
    {view === "results" && <details open={comparison !== null} className="mt-3 border-t border-pp-line-soft pt-3">
      <summary className="cursor-pointer text-sm font-medium text-pp-ink">{comparison ? "Comparison active" : "Compare periods"}</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium text-gray-600">Compare to
        <select aria-label="Compare to" value={compareMode} disabled={pending} onChange={(event) => {
          const mode = event.target.value as CompareMode;
          setCompareMode(mode);
          if (mode !== "custom") navigate({ ...(days ? { days } : { from, to }), compare: mode });
        }} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
          <option value="none">No comparison</option>
          <option value="previous">Previous period</option>
          <option value="year">Same dates last year</option>
          <option value="custom">Custom dates</option>
        </select>
      </label>
      {compareMode === "custom" && <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (compareFrom && compareTo && compareFrom <= compareTo) navigate({ ...(days ? { days } : { from, to }), compare: "custom", compareFrom, compareTo });
      }}>
        <label className="text-xs font-medium text-gray-600">From
          <input aria-label="Comparison from date" type="date" required value={compareFrom} onChange={(event) => setCompareFrom(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <label className="text-xs font-medium text-gray-600">To
          <input aria-label="Comparison to date" type="date" required min={compareFrom || undefined} value={compareTo} onChange={(event) => setCompareTo(event.target.value)} className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" />
        </label>
        <button disabled={pending || !compareFrom || !compareTo || compareFrom > compareTo} className="pp-btn pp-btn-primary disabled:opacity-40">Apply comparison</button>
      </form>}
    </div></details>}
  </div>;
}
