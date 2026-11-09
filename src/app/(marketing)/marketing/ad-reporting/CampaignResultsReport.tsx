"use client";

import { readApiResponse } from "@/lib/api-response";

import { groupCampaignSegments, type SegmentCampaign } from "@/lib/marketing/campaign-segments";
import { conversionMetrics, conversionEfficiency } from "@/lib/marketing/conversions";

import { Fragment, useId, useEffect, useMemo, useState } from "react";
import { paidOverview } from "@/lib/marketing/paid-overview";
import type { ReportScope } from "@/lib/marketing/report-scope";
import { attachGoogleSpendCampaigns, attachMetaSpendCampaigns, combineCampaignRows, type CampaignWithSpend, type GoogleSpendCampaign, type ReportCampaign } from "@/lib/marketing/campaign-results";
import type { MetaSpendCampaign } from "@/lib/marketing/meta-spend-breakdown";
import { FacebookCampaignReportTable, GoogleCampaignReportTable } from "./CampaignReportTables";
import { GoogleLsaLeadReportTable } from "./GoogleLsaLeadReportTable";
import { CampaignSyncControls } from "./CampaignSyncControls";
import type { loadLeadOutcomes } from "./LeadOutcomesReport";
import type { ReportSource } from "./report-range";
import { MarketingPrintButton } from "../MarketingPrintButton";

type Outcomes = Awaited<ReturnType<typeof loadLeadOutcomes>>;
type Source = Exclude<ReportSource, "all"> | "unattributed";
type LeadData = {
  totals: { submissions: number; selected: number };
  campaigns: ReportCampaign[];
};
type Metric = {
  metaAdSpend: number | null; googleAdSpend: number | null; googleLsaAdSpend: number | null;
  googleLsaLeadCount: number | null;
  googleLsaCallOutcomes: {
    conversions: number | null; valuePerConversion: number | null;
    linked: number; ambiguous: number; bookedLeads: number | null; appointments: number | null;
    netPaidCents: number | null; appointmentsBackfilled: boolean;
  } | null;
  metaSpendCampaigns: MetaSpendCampaign[] | null;
  googleSpendCampaigns: GoogleSpendCampaign[] | null;
  metaDataComplete: boolean; metaDataThrough: string | null;
  moegoDataAvailable: boolean; leadsLimited: boolean;
  googleSpendOrigin: "manual" | "csv" | "api" | null;
  googleLsaSpendOrigin: "manual" | "csv" | "api" | null;
  googleLsaSyncedAt: string | null;
  metaSyncedAt: string | null; moegoSyncedAt: string | null; googleSyncedAt: string | null;
};

const SOURCES: Source[] = ["meta", "google-ads", "google-lsa", "unattributed"];
const LABELS: Record<Source, string> = {
  meta: "Meta", "google-ads": "Google Ads", "google-lsa": "Google LSA", unattributed: "Unattributed",
};
const dollars = (cents: number | null) => cents === null ? "—" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const percentage = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(2)}%`;
const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US");
const costPerLead = (spendCents: number | null, leads: number | null) => dollars(spendCents !== null && leads !== null && leads > 0 ? spendCents / leads : null);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const reportDate = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
const keyFor = (source: Source, id: string | null, name: string) => `${source}|${id ?? `name:${name}`}`;

export function CampaignResultsReport({ from, to, source, rangeLabel, outcomes, segmentCatalog = [], scope = { business: "all", service: "all" } }: {
  from: string; to: string; source: ReportSource; rangeLabel: string; outcomes: Outcomes; scope?: ReportScope; segmentCatalog?: SegmentCampaign[];
}) {
  const headingId = useId();
  const query = new URLSearchParams({ from, to, source, ...scope }).toString();
  const [data, setData] = useState<{ query: string; leads: LeadData | null; metric: Metric | null; leadError: boolean; metricError: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<"google-ads" | null>(null);
  const [amount, setAmount] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [expandedSegments, setExpandedSegments] = useState<string[]>([]);
  const [showDefinitions, setShowDefinitions] = useState(false);
  const [showLeads, setShowLeads] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async <T,>(url: string): Promise<T> => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Report request failed: ${response.status}`);
      return readApiResponse(response);
    };
    Promise.allSettled([
      load<LeadData>(`/api/marketing/lead-attribution?${query}`),
      load<{ metric: Metric }>(`/api/marketing/live-report?${query}`),
    ]).then(([leadResult, metricResult]) => {
      if (cancelled) return;
      setData({
        query,
        leads: leadResult.status === "fulfilled" ? leadResult.value : null,
        metric: metricResult.status === "fulfilled" ? metricResult.value.metric : null,
        leadError: leadResult.status === "rejected",
        metricError: metricResult.status === "rejected" || !metricResult.value?.metric,
      });
    });
    return () => { cancelled = true; };
  }, [query, refresh]);

  const current = data?.query === query ? data : null;
  const leads = current?.leads;
  const metric = current?.metric;
  const visibleSources = source === "all" ? SOURCES : [source];
  const campaigns = useMemo(() => attachGoogleSpendCampaigns(
    attachMetaSpendCampaigns(combineCampaignRows(leads?.campaigns ?? [], outcomes.campaigns), scope.service === "all" ? metric?.metaSpendCampaigns ?? null : null),
    scope.service === "all" ? metric?.googleSpendCampaigns ?? null : null,
  ), [leads, outcomes.campaigns, metric?.metaSpendCampaigns, metric?.googleSpendCampaigns, scope.service]);

  function sourceSpend(rowSource: Source): number | null {
    if (scope.service !== "all" || !metric || rowSource === "unattributed") return null;
    if (rowSource === "meta") return metric.metaDataComplete ? metric.metaAdSpend : null;
    return rowSource === "google-ads" ? metric.googleAdSpend : metric.googleLsaAdSpend;
  }

  function getCampaignSpend(campaign: CampaignWithSpend): number | null {
    return scope.service !== "all" ? null : campaign.source === "meta" && metric?.metaDataComplete
                    ? campaign.metaSpend?.spendCents ?? (campaign.id ? 0 : null)
                    : campaign.source === "google-ads" && metric?.googleSpendCampaigns != null
                      ? campaign.googleSpend?.spendCents ?? null : null;
  }

  async function saveSpend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setSaveError("");
    try {
      const response = await fetch("/api/marketing/manual-spend", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to, source: editing, amount }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || "Could not save spend.");
      setEditing(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save spend.");
    } finally {
      setSaving(false);
    }
  }

  const overview = paidOverview(campaigns, visibleSources, (value) => sourceSpend(value as Source), Boolean(leads), outcomes.appointmentsAvailable, Boolean(outcomes.orderDataAvailable && metric?.moegoDataAvailable));

  const conversionsAvailable = Boolean(outcomes.orderDataAvailable && metric?.moegoDataAvailable);
  const paidConversions = conversionMetrics(campaigns.filter((row) => visibleSources.includes(row.source) && (row.source === "meta" || row.source === "google-ads")).flatMap((row) => row.customerPayments ?? []), conversionsAvailable);

  const paidEfficiency = conversionEfficiency(overview.spend, overview.leads, paidConversions.conversions);

  return <section aria-labelledby={headingId} className="pp-marketing-campaign-results space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={headingId} className="text-lg font-semibold text-gray-900">Campaign results</h2>
        <p className="mt-1 text-sm text-gray-600">Ad spend, leads, cost per lead, and MoeGo outcomes for {rangeLabel}.</p>
      </div>
      <div className="flex w-full items-start gap-2 print:hidden">
        <div className="min-w-0 flex-1"><CampaignSyncControls from={from} to={to} isAdmin={outcomes.isAdmin}
          metaSyncedAt={metric?.metaSyncedAt ?? null} googleSyncedAt={metric?.googleSyncedAt ?? null} googleLsaSyncedAt={metric?.googleLsaSyncedAt ?? null}
          moegoSyncedAt={outcomes.appointmentUpdatedAt} onUpdated={() => setRefresh((value) => value + 1)} /></div>
        <MarketingPrintButton />
      </div>
    </div>

    {scope.service !== "all" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Service filters use requested services on website inquiries. Ad spend, cost ratios, and LSA call outcomes are unavailable by service because campaigns and calls are not reliably allocated to individual services.</p>}
    {scope.business !== "all" && <p className="text-xs text-gray-600">Meta spend uses campaign business assignments; shared campaigns may appear in both businesses. Business totals are not additive. Unassigned campaigns are excluded.</p>}
    {source !== "google-lsa" && <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h3 className="font-semibold text-gray-900">Paid website lead overview</h3>
      <p className="mt-1 text-sm text-gray-600">{reportDate(from)} – {reportDate(to)} · {source === "all" ? "Meta + Google Ads" : LABELS[source]}</p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {[["Ad spend", dollars(overview.spend)], ["Website leads", number(overview.leads)], ["Booked leads", number(overview.booked)], ["Paying customers", number(paidConversions.conversions)], ["Revenue", dollars(overview.revenue)]].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-pp-surface-2 p-3"><p className="text-xs font-medium text-pp-ink-3">{label}</p><p className="mt-2 break-words text-2xl font-semibold tabular-nums text-pp-ink">{value}</p></div>)}
      </div>
      <details className="mt-3 border-t border-pp-line-soft pt-3">
        <summary className="cursor-pointer text-sm font-medium text-pp-ink">Cost and conversion metrics</summary>
        <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[["Cost per booked lead", dollars(overview.costPerBooked)], ["Revenue per conversion", dollars(paidConversions.valuePerConversion)], ["Cost per conversion", dollars(paidEfficiency.costPerConversion)], ["Conversion rate", percentage(paidEfficiency.conversionRate)]].map(([label, value]) => <div key={label}><dt className="text-xs text-pp-ink-3">{label}</dt><dd className="mt-1 font-semibold tabular-nums text-pp-ink">{value}</dd></div>)}
        </dl>
      </details>
      <p className="mt-3 text-sm text-pp-ink-3">Leads are submissions; conversions are paying customers, including returning customers. — means unavailable. <a onClick={() => setShowDefinitions(true)} href={`#${headingId}-definitions`} className="underline">How these numbers work</a></p>
      {(outcomes.incomplete || metric?.leadsLimited) && <p className="mt-2 text-sm text-amber-800">MoeGo outcomes may be incomplete. Review data freshness before acting on these figures.</p>}
    </div>}


    <div className="pp-marketing-campaign-table overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1550px] text-left text-sm">
          <caption className="pp-marketing-print-period text-left">Reporting period: {reportDate(from)} – {reportDate(to)}</caption>
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600"><tr>
            <th scope="col" className="px-4 py-3 font-medium">Source / segment</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Ad spend</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Leads</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Cost per lead</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">MoeGo linked</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Booked</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Revenue</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Conversions</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Revenue per conversion</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Cost per conversion</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Conversion rate</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">ROAS</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {visibleSources.map((rowSource) => {
              const sourceCampaigns = campaigns.filter((row) => row.source === rowSource);
              const spend = sourceSpend(rowSource);
              const forms = leads ? sourceCampaigns.reduce((sum, row) => sum + row.formLeads, 0) : null;
              const sourceLeads = rowSource === "google-lsa" ? metric && scope.service === "all" ? metric.googleLsaLeadCount : null : forms;
              const linked = sourceCampaigns.reduce((sum, row) => sum + row.linked, 0);
              const booked = sourceCampaigns.reduce((sum, row) => sum + row.bookedLeads, 0);
              const paid = outcomes.orderDataAvailable && metric?.moegoDataAvailable ? sourceCampaigns.reduce((sum, row) => sum + row.netPaidCents, 0) : null;
              const lsaCalls = rowSource === "google-lsa" && scope.service === "all" ? metric?.googleLsaCallOutcomes : null;
              const sourceLinked = rowSource === "google-lsa" ? lsaCalls?.linked ?? null : linked;
              const sourceBooked = rowSource === "google-lsa" ? lsaCalls?.bookedLeads ?? null
                : outcomes.appointmentsAvailable ? booked : null;
              const sourcePaid = rowSource === "google-lsa" ? lsaCalls?.netPaidCents ?? null : paid;
              const sourceConversions = rowSource === "google-lsa" ? { conversions: lsaCalls?.conversions ?? null, valuePerConversion: lsaCalls?.valuePerConversion ?? null } : conversionMetrics(sourceCampaigns.flatMap((row) => row.customerPayments ?? []), conversionsAvailable);
              const sourceEfficiency = conversionEfficiency(spend, sourceLeads, sourceConversions.conversions);
              const ratio = spend && sourcePaid !== null ? `${(sourcePaid / spend).toFixed(2)}x` : "—";
              return <Fragment key={rowSource}>
                <tr className="bg-slate-50 font-semibold text-gray-900">
                  <th scope="row" className="px-4 py-3">{LABELS[rowSource]}{rowSource === "meta" && <span className="ml-1 text-xs font-normal text-gray-500">· connected</span>}{rowSource === "google-lsa" && <span className="ml-1 text-xs font-normal text-gray-500">· calls</span>}</th>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {editing === rowSource ? <form onSubmit={saveSpend} className="flex items-center justify-end gap-1">
                      <span>$</span><input aria-label={`${LABELS[rowSource]} spend in dollars`} type="number" min="0" max="21474836.47" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-right" />
                      <button type="submit" disabled={saving} className="text-blue-700 underline print:hidden">{saving ? "Saving…" : "Save"}</button>
                      <button type="button" onClick={() => setEditing(null)} className="text-gray-600 underline print:hidden">Cancel</button>
                    </form> : <>{dollars(spend)}{rowSource === "google-lsa" && <span className="block text-xs font-normal text-amber-800">{metric?.googleLsaSpendOrigin === "api" ? "Actual Google spend" : metric?.googleLsaSpendOrigin === "csv" ? "Estimated · $28 per call" : "Not synced for these dates"}</span>}{rowSource === "google-ads" && scope.business === "all" && scope.service === "all" && <button type="button" onClick={() => { setEditing(rowSource); setAmount(((spend ?? 0) / 100).toFixed(2)); setSaveError(""); }} className="ml-2 text-xs font-normal text-blue-700 underline print:hidden">Edit</button>}</>}
                  </td>
                  <td className="px-4 py-3 text-right">{number(sourceLeads)}</td>
                  <td className="px-4 py-3 text-right">{costPerLead(spend, sourceLeads)}</td>
                  <td className="px-4 py-3 text-right">{number(sourceLinked)}</td>
                  <td className="px-4 py-3 text-right">{number(sourceBooked)}</td>
                  <td className="px-4 py-3 text-right">{dollars(sourcePaid)}</td>
                  <td className="px-4 py-3 text-right">{number(sourceConversions.conversions)}</td>
                  <td className="px-4 py-3 text-right">{dollars(sourceConversions.valuePerConversion)}</td>
                  <td className="px-4 py-3 text-right">{dollars(sourceEfficiency.costPerConversion)}</td>
                  <td className="px-4 py-3 text-right">{percentage(sourceEfficiency.conversionRate)}</td>
                  <td className="px-4 py-3 text-right">{ratio}</td>
                </tr>
                {groupCampaignSegments(sourceCampaigns, segmentCatalog).map((group) => {
                  const segmentKey = rowSource + "|" + group.value;
                  const open = expandedSegments.includes(segmentKey);
                  const amounts = group.campaigns.map(getCampaignSpend);
                  const segmentSpend = amounts.every((value) => value !== null) ? amounts.reduce<number>((sum, value) => sum + (value ?? 0), 0) : null;
                  const segmentLeads = leads ? group.campaigns.reduce((sum, row) => sum + row.formLeads, 0) : null;
                  const segmentPaid = conversionsAvailable ? group.campaigns.reduce((sum, row) => sum + row.netPaidCents, 0) : null;
                  const converted = conversionMetrics(group.campaigns.flatMap((row) => row.customerPayments ?? []), conversionsAvailable);
                  const efficiency = conversionEfficiency(segmentSpend, segmentLeads, converted.conversions);
                  return <Fragment key={segmentKey}><tr className="font-medium hover:bg-gray-50">
                    <th scope="row" className="px-4 py-3 pl-8"><button type="button" aria-expanded={open} onClick={() => setExpandedSegments((current) => open ? current.filter((key) => key !== segmentKey) : [...current, segmentKey])} className="text-left hover:text-blue-700"><span aria-hidden="true" className="mr-2 text-gray-400">{open ? "▾" : "▸"}</span>{group.label}<span className="block pl-5 text-xs font-normal text-gray-500">{group.campaigns.length} {group.campaigns.length === 1 ? "campaign" : "campaigns"}</span></button></th>
                    <td className="px-4 py-3 text-right">{dollars(segmentSpend)}</td>
                    <td className="px-4 py-3 text-right">{number(segmentLeads)}</td>
                    <td className="px-4 py-3 text-right">{costPerLead(segmentSpend, segmentLeads)}</td>
                    <td className="px-4 py-3 text-right">{number(group.campaigns.reduce((sum, row) => sum + row.linked, 0))}</td>
                    <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? group.campaigns.reduce((sum, row) => sum + row.bookedLeads, 0) : null)}</td>
                    <td className="px-4 py-3 text-right">{dollars(segmentPaid)}</td>
                    <td className="px-4 py-3 text-right">{number(converted.conversions)}</td>
                    <td className="px-4 py-3 text-right">{dollars(converted.valuePerConversion)}</td>
                    <td className="px-4 py-3 text-right">{dollars(efficiency.costPerConversion)}</td>
                    <td className="px-4 py-3 text-right">{percentage(efficiency.conversionRate)}</td>
                    <td className="px-4 py-3 text-right">{segmentSpend && segmentPaid !== null ? (segmentPaid / segmentSpend).toFixed(2) + "x" : "—"}</td>
                  </tr>{open && group.campaigns.map((campaign) => {
                  const campaignConversions = conversionMetrics(campaign.customerPayments ?? [], conversionsAvailable);
                  const campaignKey = keyFor(campaign.source, campaign.id, campaign.name);
                  const campaignSpend = getCampaignSpend(campaign);
                  const campaignEfficiency = conversionEfficiency(campaignSpend, leads ? campaign.formLeads : null, campaignConversions.conversions);
                  const campaignReturn = campaignSpend && outcomes.orderDataAvailable && metric?.moegoDataAvailable
                    ? `${(campaign.netPaidCents / campaignSpend).toFixed(2)}x` : "—";
                  return <Fragment key={campaignKey}>
                    <tr className="hover:bg-gray-50">
                      <th scope="row" className="max-w-80 px-4 py-3 pl-12 font-normal text-gray-800">
                        <button type="button" aria-expanded={expanded === campaignKey} onClick={() => setExpanded(expanded === campaignKey ? null : campaignKey)} className="text-left hover:text-blue-700">
                          <span aria-hidden="true" className="mr-2 text-gray-400">{expanded === campaignKey ? "▾" : "▸"}</span>{campaign.name}
                        </button>
                        {campaign.id && campaign.id !== campaign.name && <span className="block pl-5 text-xs text-gray-400">ID: {campaign.id}</span>}
                        {campaign.spendMatchedByName && <span className="block pl-5 text-xs text-gray-500">Spend matched by unique campaign name · Meta ID: {campaign.metaSpend?.id ?? "unavailable"}</span>}
                        {campaign.googleSpendMatchedByName && <span className="block pl-5 text-xs text-gray-500">Website form tags matched by campaign name</span>}
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums">{dollars(campaignSpend)}</td>
                      <td className="px-4 py-3 text-right">{number(leads ? campaign.formLeads : null)}</td>
                      <td className="px-4 py-3 text-right">{costPerLead(campaignSpend, leads ? campaign.formLeads : null)}</td>
                      <td className="px-4 py-3 text-right">{campaign.linked}</td>
                      <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? campaign.bookedLeads : null)}</td>
                      <td className="px-4 py-3 text-right">{dollars(outcomes.orderDataAvailable && metric?.moegoDataAvailable ? campaign.netPaidCents : null)}</td>
                      <td className="px-4 py-3 text-right">{number(campaignConversions.conversions)}</td>
                      <td className="px-4 py-3 text-right">{dollars(campaignConversions.valuePerConversion)}</td>
                      <td className="px-4 py-3 text-right">{dollars(campaignEfficiency.costPerConversion)}</td>
                      <td className="px-4 py-3 text-right">{percentage(campaignEfficiency.conversionRate)}</td>
                      <td className="px-4 py-3 text-right">{campaignReturn}</td>
                    </tr>
                    {expanded === campaignKey && <tr><td colSpan={12} className="bg-white px-8 py-4">
                      {campaign.metaSpend && <div className="mb-4 space-y-3 text-sm">
                        <p className="text-xs font-medium text-gray-600">Meta spend by ad set and ad</p>
                        {campaign.metaSpend.adsets.map((adset) => <div key={adset.id ?? "unknown"}>
                          <div className="flex justify-between gap-4 border-b border-gray-200 py-1 font-medium"><span>{adset.name}</span><span className="whitespace-nowrap tabular-nums">{dollars(adset.spendCents)}</span></div>
                          {adset.ads.map((ad) => <div key={ad.id} className="flex justify-between gap-4 border-b border-gray-100 py-1 pl-5"><span>{ad.name}</span><span className="whitespace-nowrap tabular-nums">{dollars(ad.spendCents)}</span></div>)}
                        </div>)}
                      </div>}
                      <p className="mb-2 text-xs font-medium text-gray-600">Website forms with captured ad tags</p>
                      {campaign.ads.length ? <div className="space-y-1 text-sm">{campaign.ads.map((ad) => <div key={`${ad.adsetId}|${ad.adId}`} className="flex justify-between gap-4 border-b border-gray-100 py-1"><span>{ad.adsetName || ad.adsetId || "No ad set"} · {ad.adName || ad.adId || "No ad"}</span><span className="whitespace-nowrap">{ad.leads} website forms</span></div>)}</div> : <p className="text-sm text-gray-500">No ad tags were captured for these forms.</p>}
                    </td></tr>}
                  </Fragment>;
                })}</Fragment>;
                })}
              </Fragment>;
            })}
            {source === "all" && <tr className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-gray-900">
              <th scope="row" className="px-4 py-3">Paid website subtotal</th><td className="px-4 py-3 text-right">{dollars(overview.spend)}</td>
              <td className="px-4 py-3 text-right">{number(overview.leads)}</td>
              <td className="px-4 py-3 text-right">{costPerLead(overview.spend, overview.leads)}</td>
              <td className="px-4 py-3 text-right">{overview.linked}</td>
              <td className="px-4 py-3 text-right">{number(overview.booked)}</td>
              <td className="px-4 py-3 text-right">{dollars(overview.revenue)}</td>
              <td className="px-4 py-3 text-right">{number(paidConversions.conversions)}</td>
              <td className="px-4 py-3 text-right">{dollars(paidConversions.valuePerConversion)}</td>
              <td className="px-4 py-3 text-right">{dollars(paidEfficiency.costPerConversion)}</td>
              <td className="px-4 py-3 text-right">{percentage(paidEfficiency.conversionRate)}</td>
              <td className="px-4 py-3 text-right">{overview.roas !== null ? `${overview.roas.toFixed(2)}x` : "—"}</td>
            </tr>}
          </tbody>
        </table>
      </div>
      {saveError && <p role="alert" className="border-t border-red-100 px-4 py-2 text-sm text-red-700">{saveError}</p>}
      {(current?.leadError || current?.metricError) && <p role="alert" className="border-t border-red-100 px-4 py-2 text-sm text-red-700">{current.leadError ? "Website form counts could not be loaded. " : ""}{current.metricError ? "Spend could not be loaded." : ""}</p>}
      {!current && <p className="border-t border-gray-100 px-4 py-2 text-sm text-gray-500">Loading spend and website forms…</p>}
    </div>

    <details open={showDefinitions} onToggle={(event) => setShowDefinitions(event.currentTarget.open)} id={`${headingId}-definitions`} className="scroll-mt-4 space-y-2 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-600"><summary className="cursor-pointer text-sm font-medium text-gray-800">How these numbers work</summary>
      <p>Website submissions attributed to the selected paid sources only. Booked counts submissions with a qualifying booking, not unique new customers. LSA calls and unattributed inquiries are separate below. Conversions count unique paying customers after their lead, including returning customers; verified duplicate profiles count once. Revenue per conversion is their average net collected amount after refunds. Payments can occur after the selected dates; this is observed revenue, not proof of ad causation.</p>
      <p>Revenue is net collected after the lead, after refunds. Cost per conversion is ad spend divided by unique paying customers. Conversion rate is unique paying customers divided by the displayed lead count (website submissions, or imported calls for LSA); repeat inquiries remain in the lead denominator. Zero conversions with known leads shows 0%; unavailable data or a zero denominator shows a dash.</p>
      <p>Conversions are distinct verified customers with positive net payments after a website lead. Repeat inquiries and duplicate profiles count once within each row; the subtotal deduplicates across campaigns and sources, so conversion counts are not additive. These include returning customers and do not establish first-ever purchases. Revenue per conversion divides converted customer net payments by conversions; no conversions or unavailable payment data shows a dash. The LSA source row uses unique paying customers matched to calls; its campaign rows refer only to website forms. LSA is excluded from the paid website subtotal to avoid overlap.</p>
      <p>Website forms are actual submissions; Meta platform leads may differ. The Google LSA source row uses exact-phone matches to imported calls, including existing customers. Phones matching multiple MoeGo profiles are linked but excluded from LSA bookings and payments. Because the CSV has dates rather than call times, LSA outcomes exclude MoeGo activity on a call date and use later New York calendar dates. Each appointment and order is assigned to the latest qualifying LSA call once. Booked counts leads with at least one qualifying appointment. ROAS is revenue divided by known source spend; it does not prove the ad caused a purchase.</p>
      <p>Meta, Google Ads, and unattributed leads are saved website submissions. The LSA source row counts phone leads synced from Google, or imported CSV calls when this period has not been synced. Actual LSA spend includes all LSA lead types and uses Google’s reported campaign cost; CSV-only periods retain the labeled $28-per-call estimate; tagged website forms appear separately in its campaign rows. Cost per lead is ad spend divided by leads; a dash means spend or lead count is unavailable, or there are no leads. LSA calls lack campaign attribution, so LSA campaign rows show only tagged submissions. The paid website subtotal includes only Meta and Google Ads spend and attributed website outcomes. Unattributed inquiries and LSA are excluded. LSA call outcomes can overlap with website outcomes and must not be added together.{metric?.googleLsaCallOutcomes && !metric.googleLsaCallOutcomes.appointmentsBackfilled ? " Run Backfill LSA appointments for this date range to complete the call booking counts." : ""}</p>
      <p>Spend uses the selected calendar dates. Meta campaign, ad set, and ad amounts come from the same synced insight rows as the Meta source total. Google Ads campaign spend uses the saved campaign IDs for this range; campaigns with spend appear even without tagged website forms. Google Ads form tags join a spend row when its campaign name is unique after case, space, hyphen, and underscore normalization. Google manual spend covers Pet Resort and Mobile Grooming together for this exact range and takes priority over campaign totals. A dash means unavailable, not zero.</p>
      <p>Google LSA spend is estimated at $28 for each unique imported lead received in the selected dates, regardless of charge status. The CSV import is updated manually.</p>
      <p>{outcomes.linkedSubmissions} linked submissions ({outcomes.linkedCustomers} customers); {outcomes.duplicateProfileLeads} include verified duplicate MoeGo profiles. Appointments synced: {dateTime(outcomes.appointmentSyncedAt)}. Orders synced: {dateTime(outcomes.orderSyncedAt)}. Meta synced: {dateTime(metric?.metaSyncedAt ?? null)}.</p>
      {outcomes.incomplete && <p className="text-amber-700">Some MoeGo counts may be incomplete while a sync is behind.</p>}
      {metric && !metric.metaDataComplete && (source === "all" || source === "meta") && <p className="text-amber-700">Meta spend does not cover the full period{metric.metaDataThrough ? ` (latest available day: ${metric.metaDataThrough})` : ""}; spend and return are hidden.</p>}
      {metric?.leadsLimited && <p className="text-amber-700">MoeGo outcomes include only the first 500 linked submissions.</p>}
    </details>

    <details onToggle={(event) => setShowLeads(event.currentTarget.open)} className="rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">MoeGo-linked submissions ({outcomes.leads.length})</summary>
      {showLeads && <div className="overflow-x-auto border-t border-gray-100">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr>{["Submitted", "Customer", "Business", "Source", "Campaign", "Services", "Profiles", "Booked", "Pending", "First booked", "Revenue"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-100">{outcomes.leads.map((lead) => <tr key={lead.id}>
            <td className="whitespace-nowrap px-4 py-3">{dateTime(lead.receivedAt)}</td><td className="px-4 py-3">{lead.customer}</td><td className="px-4 py-3">{lead.business}</td>
            <td className="px-4 py-3">{LABELS[lead.source]}</td><td className="px-4 py-3">{lead.campaignName || "—"}</td><td className="px-4 py-3">{lead.services.join(", ") || "—"}</td>
            <td className="px-4 py-3">{lead.profileCount}</td><td className="px-4 py-3">{number(outcomes.appointmentsAvailable ? lead.booked : null)}</td><td className="px-4 py-3">{number(outcomes.appointmentsAvailable ? lead.pending : null)}</td>
            <td className="whitespace-nowrap px-4 py-3">{outcomes.appointmentsAvailable ? dateTime(lead.firstBookedAt) : "—"}</td><td className="px-4 py-3">{dollars(outcomes.orderDataAvailable ? lead.netPaidCents : null)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </details>
    <p className="text-xs text-gray-600">This list includes forms linked to MoeGo customers. Website form totals above include all saved submissions.</p>

    <details onToggle={(event) => setShowPlatform(event.currentTarget.open)} className="rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">Platform metrics and CSV imports (all services)</summary>
      {showPlatform && <div className="space-y-6 border-t border-gray-100 p-4">
        {([{ key: "pet-resort", label: "Pet Resort" }, { key: "mobile-grooming", label: "Mobile Grooming" }] as const).filter((item) => scope.business === "all" || scope.business === item.key).map((business) => <div key={business.key} className="space-y-4">
          <h3 className="font-semibold text-gray-900">{business.label}</h3>
          {(source === "all" || source === "meta") && <FacebookCampaignReportTable business={business.key} from={from} to={to} />}
          {(source === "all" || source === "google-ads") && <GoogleCampaignReportTable business={business.key} from={from} to={to} />}
          {(source === "all" || source === "google-lsa") && <GoogleLsaLeadReportTable key={`${business.key}-${refresh}`} business={business.key} from={from} to={to} />}
        </div>)}
      </div>}
    </details>
  </section>;
}
