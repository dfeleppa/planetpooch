import { getCampaignSegmentCatalog } from "@/lib/marketing/campaign-segment-catalog";
import { CampaignSegmentAssignments } from "./CampaignSegmentAssignments";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMarketing } from "@/lib/auth-helpers";
import { reportScope, marketingViewUrl, BUSINESSES, SERVICES, type ReportScope } from "@/lib/marketing/report-scope";
import { MetaCreativePerformance } from "./evaluate/MetaCreativePerformance";
import { loadLeadOutcomes } from "./ad-reporting/LeadOutcomesReport";
import { CampaignResultsReport } from "./ad-reporting/CampaignResultsReport";
import { LeadFollowUpList } from "./ad-reporting/LeadFollowUpList";
import { CampaignSyncControls } from "./ad-reporting/CampaignSyncControls";
import { CampaignReportFilters } from "./ad-reporting/CampaignReportFilters";
import { comparisonRange, reportingRange, type ReportSource } from "./ad-reporting/report-range";
import { Suspense } from "react";

type SearchParams = Record<string, string | undefined>;
async function Results({ from, to, source, rangeLabel, scope, followUp = false }: { from: string; to: string; source: ReportSource; rangeLabel: string; scope: ReportScope; followUp?: boolean }) {
  const [outcomes, segmentCatalog] = await Promise.all([loadLeadOutcomes({ from, to, source, scope }), followUp ? Promise.resolve([]) : getCampaignSegmentCatalog()]);
  return followUp ? <div className="space-y-4"><CampaignSyncControls moegoOnly from={from} to={to} isAdmin={outcomes.isAdmin} metaSyncedAt={null} googleSyncedAt={null} moegoSyncedAt={outcomes.appointmentUpdatedAt} /><LeadFollowUpList key={JSON.stringify({from,to,source,scope})} outcomes={outcomes} /></div> : <CampaignResultsReport from={from} to={to} source={source} rangeLabel={rangeLabel} scope={scope} outcomes={outcomes} segmentCatalog={segmentCatalog} />;
}
async function Assignments() { return <CampaignSegmentAssignments campaigns={await getCampaignSegmentCatalog()} />; }
export default async function MarketingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireMarketing();
  const query = await searchParams;
  if (query.view === "submissions") redirect(marketingViewUrl({ from: query.submissionStart, to: query.submissionEnd }, "follow-up"));
  const view = query.view === "creatives" || query.view === "follow-up" || query.view === "assignments" ? query.view : "results";
  const report = reportingRange(query);
  const scope = reportScope(query);
  const comparison = comparisonRange(report, query);
  const tabQuery = { ...query, from: report.from, to: report.to };
  const title = BUSINESSES.find((item) => item.value === scope.business)!.label + " · " + SERVICES.find((item) => item.value === scope.service)!.label;
  return <div className={view === "results" ? "pp-marketing-print-report" : undefined}>
    <nav aria-label="Marketing views" className="pp-tabs mb-5 print:hidden">
      {[{ value: "results", label: "Campaign results" }, { value: "creatives", label: "Creative performance" }, { value: "follow-up", label: "Lead follow-up" }, { value: "assignments", label: "Campaign assignments" }].map((tab) => <Link key={tab.value} href={marketingViewUrl(tabQuery, tab.value)} aria-current={view === tab.value ? "page" : undefined} className={"pp-tab " + (view === tab.value ? "is-on" : "")}>{tab.label}</Link>)}
    </nav>
    {view !== "assignments" && <><div className="print:hidden"><Suspense fallback={<p>Loading filters…</p>}><CampaignReportFilters key={JSON.stringify({report, scope, comparison, view})} from={report.from} to={report.to} source={report.source} days={report.days} comparison={comparison} scope={scope} view={view} /></Suspense></div>
    <p className="mb-5 text-sm text-gray-600">{title} · {report.from} to {report.to}</p></>}
    <Suspense fallback={<p className="text-sm text-gray-500">Loading report…</p>}>
      {view === "assignments" ? <Assignments /> : view === "creatives" ? <MetaCreativePerformance searchParams={{...query, from: report.from, to: report.to}} /> : <Results from={report.from} to={report.to} source={report.source} rangeLabel={report.label} scope={scope} followUp={view === "follow-up"} />}
    </Suspense>
    {view === "results" && comparison && <div className="mt-8 border-t-2 border-gray-200 pt-6"><p className="mb-4 text-sm font-semibold">Compare to: {comparison.label} · {comparison.from} to {comparison.to}</p><Suspense fallback={<p>Loading comparison…</p>}><Results from={comparison.from} to={comparison.to} source={report.source} rangeLabel={comparison.label} scope={scope} /></Suspense></div>}
  </div>;
}
