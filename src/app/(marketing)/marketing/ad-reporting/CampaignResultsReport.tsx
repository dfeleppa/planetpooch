"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { attachGoogleSpendCampaigns, attachMetaSpendCampaigns, combineCampaignRows, type GoogleSpendCampaign, type ReportCampaign } from "@/lib/marketing/campaign-results";
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
  metaSpendCampaigns: MetaSpendCampaign[] | null;
  googleSpendCampaigns: GoogleSpendCampaign[] | null;
  metaDataComplete: boolean; metaDataThrough: string | null;
  moegoDataAvailable: boolean; leadsLimited: boolean;
  googleSpendOrigin: "manual" | "csv" | "api" | null;
  googleLsaSpendOrigin: "manual" | "csv" | null;
  metaSyncedAt: string | null; moegoSyncedAt: string | null; googleSyncedAt: string | null;
};

const SOURCES: Source[] = ["meta", "google-ads", "google-lsa", "unattributed"];
const LABELS: Record<Source, string> = {
  meta: "Meta", "google-ads": "Google Ads", "google-lsa": "Google LSA", unattributed: "Unattributed",
};
const dollars = (cents: number | null) => cents === null ? "—" : (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const number = (value: number | null) => value === null ? "—" : value.toLocaleString("en-US");
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
const reportDate = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
const keyFor = (source: Source, id: string | null, name: string) => `${source}|${id ?? `name:${name}`}`;

export function CampaignResultsReport({ from, to, source, rangeLabel, outcomes }: {
  from: string; to: string; source: ReportSource; rangeLabel: string; outcomes: Outcomes;
}) {
  const query = new URLSearchParams({ from, to, source }).toString();
  const [data, setData] = useState<{ query: string; leads: LeadData | null; metric: Metric | null; leadError: boolean; metricError: boolean } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState<"google-ads" | "google-lsa" | null>(null);
  const [amount, setAmount] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showLeads, setShowLeads] = useState(false);
  const [showPlatform, setShowPlatform] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async <T,>(url: string): Promise<T> => {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`Report request failed: ${response.status}`);
      return response.json();
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
    attachMetaSpendCampaigns(combineCampaignRows(leads?.campaigns ?? [], outcomes.campaigns), metric?.metaSpendCampaigns ?? null),
    metric?.googleSpendCampaigns ?? null,
  ), [leads, outcomes.campaigns, metric?.metaSpendCampaigns, metric?.googleSpendCampaigns]);

  function sourceSpend(rowSource: Source): number | null {
    if (!metric || rowSource === "unattributed") return null;
    if (rowSource === "meta") return metric.metaDataComplete ? metric.metaAdSpend : null;
    return rowSource === "google-ads" ? metric.googleAdSpend : metric.googleLsaAdSpend;
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
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save spend.");
      setEditing(null);
      setRefresh((value) => value + 1);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save spend.");
    } finally {
      setSaving(false);
    }
  }

  const allSpend = visibleSources.filter((row) => row !== "unattributed").every((row) => sourceSpend(row) !== null)
    ? visibleSources.reduce((sum, row) => sum + (sourceSpend(row) ?? 0), 0) : null;
  const totalForms = leads ? leads.totals.selected : null;
  const totalRevenue = outcomes.orderDataAvailable && metric?.moegoDataAvailable ? outcomes.totalNetPaidCents : null;

  return <section aria-labelledby="campaign-results-heading" className="pp-marketing-campaign-results space-y-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id="campaign-results-heading" className="text-lg font-semibold text-gray-900">Campaign results</h2>
        <p className="mt-1 text-sm text-gray-600">One view of ad spend, submitted website forms, and outcomes observed after MoeGo-linked forms in {rangeLabel}.</p>
      </div>
      <div className="flex w-full items-start gap-2 print:hidden">
        <div className="min-w-0 flex-1"><CampaignSyncControls from={from} to={to} isAdmin={outcomes.isAdmin}
          metaSyncedAt={metric?.metaSyncedAt ?? null} googleSyncedAt={metric?.googleSyncedAt ?? null}
          moegoSyncedAt={outcomes.appointmentUpdatedAt} onUpdated={() => setRefresh((value) => value + 1)} /></div>
        <MarketingPrintButton />
      </div>
    </div>

    <div className="pp-marketing-campaign-table overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <caption className="pp-marketing-print-period text-left">Reporting period: {reportDate(from)} – {reportDate(to)}</caption>
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600"><tr>
            <th scope="col" className="px-4 py-3 font-medium">Source / campaign</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Ad spend</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Website forms</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">MoeGo linked</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Booked leads</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Appointments</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Net paid after form</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Observed return</th>
          </tr></thead>
          <tbody className="divide-y divide-gray-100">
            {visibleSources.map((rowSource) => {
              const sourceCampaigns = campaigns.filter((row) => row.source === rowSource);
              const spend = sourceSpend(rowSource);
              const forms = leads ? sourceCampaigns.reduce((sum, row) => sum + row.formLeads, 0) : null;
              const linked = sourceCampaigns.reduce((sum, row) => sum + row.linked, 0);
              const booked = sourceCampaigns.reduce((sum, row) => sum + row.bookedLeads, 0);
              const appointments = sourceCampaigns.reduce((sum, row) => sum + row.appointments, 0);
              const paid = outcomes.orderDataAvailable && metric?.moegoDataAvailable ? sourceCampaigns.reduce((sum, row) => sum + row.netPaidCents, 0) : null;
              const ratio = spend && paid !== null ? `${(paid / spend).toFixed(2)}x` : "—";
              return <Fragment key={rowSource}>
                <tr className="bg-slate-50 font-semibold text-gray-900">
                  <th scope="row" className="px-4 py-3">{LABELS[rowSource]}{rowSource === "meta" && <span className="ml-1 text-xs font-normal text-gray-500">· connected</span>}</th>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    {editing === rowSource ? <form onSubmit={saveSpend} className="flex items-center justify-end gap-1">
                      <span>$</span><input aria-label={`${LABELS[rowSource]} spend in dollars`} type="number" min="0" max="21474836.47" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} className="w-24 rounded border border-gray-300 px-2 py-1 text-right" />
                      <button type="submit" disabled={saving} className="text-blue-700 underline print:hidden">{saving ? "Saving…" : "Save"}</button>
                      <button type="button" onClick={() => setEditing(null)} className="text-gray-600 underline print:hidden">Cancel</button>
                    </form> : <>{dollars(spend)}{(rowSource === "google-ads" || rowSource === "google-lsa") && <button type="button" onClick={() => { setEditing(rowSource); setAmount(((spend ?? 0) / 100).toFixed(2)); setSaveError(""); }} className="ml-2 text-xs font-normal text-blue-700 underline print:hidden">Edit</button>}</>}
                  </td>
                  <td className="px-4 py-3 text-right">{number(forms)}</td>
                  <td className="px-4 py-3 text-right">{number(linked)}</td>
                  <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? booked : null)}</td>
                  <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? appointments : null)}</td>
                  <td className="px-4 py-3 text-right">{dollars(paid)}</td>
                  <td className="px-4 py-3 text-right">{ratio}</td>
                </tr>
                {sourceCampaigns.map((campaign) => {
                  const campaignKey = keyFor(campaign.source, campaign.id, campaign.name);
                  const campaignSpend = campaign.source === "meta" && metric?.metaDataComplete
                    ? campaign.metaSpend?.spendCents ?? (campaign.id ? 0 : null)
                    : campaign.source === "google-ads" && metric?.googleSpendCampaigns != null
                      ? campaign.googleSpend?.spendCents ?? null : null;
                  const campaignReturn = campaignSpend && outcomes.orderDataAvailable && metric?.moegoDataAvailable
                    ? `${(campaign.netPaidCents / campaignSpend).toFixed(2)}x` : "—";
                  return <Fragment key={campaignKey}>
                    <tr className="hover:bg-gray-50">
                      <th scope="row" className="max-w-80 px-4 py-3 pl-8 font-normal text-gray-800">
                        <button type="button" aria-expanded={expanded === campaignKey} onClick={() => setExpanded(expanded === campaignKey ? null : campaignKey)} className="text-left hover:text-blue-700">
                          <span aria-hidden="true" className="mr-2 text-gray-400">{expanded === campaignKey ? "▾" : "▸"}</span>{campaign.name}
                        </button>
                        {campaign.id && campaign.id !== campaign.name && <span className="block pl-5 text-xs text-gray-400">ID: {campaign.id}</span>}
                        {campaign.spendMatchedByName && <span className="block pl-5 text-xs text-gray-500">Spend matched by unique campaign name · Meta ID: {campaign.metaSpend?.id ?? "unavailable"}</span>}
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums">{dollars(campaignSpend)}</td>
                      <td className="px-4 py-3 text-right">{number(leads ? campaign.formLeads : null)}</td>
                      <td className="px-4 py-3 text-right">{campaign.linked}</td>
                      <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? campaign.bookedLeads : null)}</td>
                      <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? campaign.appointments : null)}</td>
                      <td className="px-4 py-3 text-right">{dollars(outcomes.orderDataAvailable && metric?.moegoDataAvailable ? campaign.netPaidCents : null)}</td>
                      <td className="px-4 py-3 text-right">{campaignReturn}</td>
                    </tr>
                    {expanded === campaignKey && <tr><td colSpan={8} className="bg-white px-8 py-4">
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
                })}
              </Fragment>;
            })}
            {source === "all" && <tr className="border-t-2 border-gray-200 bg-gray-100 font-semibold text-gray-900">
              <th scope="row" className="px-4 py-3">Total</th><td className="px-4 py-3 text-right">{dollars(allSpend)}</td>
              <td className="px-4 py-3 text-right">{number(totalForms)}</td>
              <td className="px-4 py-3 text-right">{outcomes.linkedSubmissions}</td>
              <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? outcomes.totalBookedLeads : null)}</td>
              <td className="px-4 py-3 text-right">{number(outcomes.appointmentsAvailable ? outcomes.totalBooked : null)}</td>
              <td className="px-4 py-3 text-right">{dollars(totalRevenue)}</td>
              <td className="px-4 py-3 text-right">{allSpend && totalRevenue !== null ? `${(totalRevenue / allSpend).toFixed(2)}x` : "—"}</td>
            </tr>}
          </tbody>
        </table>
      </div>
      {saveError && <p role="alert" className="border-t border-red-100 px-4 py-2 text-sm text-red-700">{saveError}</p>}
      {(current?.leadError || current?.metricError) && <p role="alert" className="border-t border-red-100 px-4 py-2 text-sm text-red-700">{current.leadError ? "Website form counts could not be loaded. " : ""}{current.metricError ? "Spend could not be loaded." : ""}</p>}
      {!current && <p className="border-t border-gray-100 px-4 py-2 text-sm text-gray-500">Loading spend and website forms…</p>}
    </div>

    <div className="space-y-1 text-xs text-gray-600">
      <p>Website forms are actual submissions; Meta platform leads may differ. MoeGo outcomes can occur after the form date. Each appointment and order is assigned to the latest prior linked form. Observed return is net paid after form divided by known source spend; it does not prove the ad caused a purchase.</p>
      <p>Spend uses the selected calendar dates. Meta campaign, ad set, and ad amounts come from the same synced insight rows as the Meta source total. Google Ads campaign spend uses the saved campaign IDs for this range; campaigns with spend appear even without tagged website forms. Form tags with different campaign IDs remain separate until mapped. Google manual spend covers Pet Resort and Mobile Grooming together for this exact range and takes priority over campaign totals. A dash means unavailable, not zero.</p>
      <p>{outcomes.linkedSubmissions} linked submissions ({outcomes.linkedCustomers} customers); {outcomes.duplicateProfileLeads} include verified duplicate MoeGo profiles. Appointments synced: {dateTime(outcomes.appointmentSyncedAt)}. Orders synced: {dateTime(outcomes.orderSyncedAt)}. Meta synced: {dateTime(metric?.metaSyncedAt ?? null)}.</p>
      {outcomes.incomplete && <p className="text-amber-700">Some MoeGo counts may be incomplete while a sync is behind.</p>}
      {metric && !metric.metaDataComplete && (source === "all" || source === "meta") && <p className="text-amber-700">Meta spend does not cover the full period{metric.metaDataThrough ? ` (latest available day: ${metric.metaDataThrough})` : ""}; spend and return are hidden.</p>}
      {metric?.leadsLimited && <p className="text-amber-700">MoeGo outcomes include only the first 500 linked submissions.</p>}
    </div>

    <details onToggle={(event) => setShowLeads(event.currentTarget.open)} className="rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">MoeGo-linked submissions ({outcomes.leads.length})</summary>
      {showLeads && <div className="overflow-x-auto border-t border-gray-100">
        <table className="w-full min-w-[1000px] text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr>{["Submitted", "Customer", "Business", "Source", "Campaign", "Services", "Profiles", "Booked", "Pending", "First booked", "Net paid after form"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead>
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
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">Platform metrics and CSV imports</summary>
      {showPlatform && <div className="space-y-6 border-t border-gray-100 p-4">
        {([{ key: "pet-resort", label: "Pet Resort" }, { key: "mobile-grooming", label: "Mobile Grooming" }] as const).map((business) => <div key={business.key} className="space-y-4">
          <h3 className="font-semibold text-gray-900">{business.label}</h3>
          {(source === "all" || source === "meta") && <FacebookCampaignReportTable business={business.key} from={from} to={to} />}
          {(source === "all" || source === "google-ads") && <GoogleCampaignReportTable business={business.key} from={from} to={to} />}
          {(source === "all" || source === "google-lsa") && <GoogleLsaLeadReportTable business={business.key} from={from} to={to} />}
        </div>)}
      </div>}
    </details>
  </section>;
}
