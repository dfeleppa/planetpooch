import Link from "next/link";
import { redirect } from "next/navigation";
import { requireMarketing } from "@/lib/auth-helpers";
import { MetaCreativePerformance } from "./evaluate/MetaCreativePerformance";
import { loadLeadOutcomes } from "./ad-reporting/LeadOutcomesReport";
import { CampaignResultsReport } from "./ad-reporting/CampaignResultsReport";
import { CampaignReportFilters } from "./ad-reporting/CampaignReportFilters";
import { reportingRange } from "./ad-reporting/report-range";
import { Suspense } from "react";
import type { ReportSource } from "./ad-reporting/report-range";

type SearchParams = { view?: string; month?: string; year?: string; range?: string; source?: string; submissionStart?: string; submissionEnd?: string; page?: string; days?: string; from?: string; to?: string; campaign?: string; sort?: string; dir?: string };

async function Results({ from, to, source, rangeLabel }: { from: string; to: string; source: ReportSource; rangeLabel: string }) {
  const outcomes = await loadLeadOutcomes({ from, to, source });
  return <CampaignResultsReport from={from} to={to} source={source} rangeLabel={rangeLabel} outcomes={outcomes} />;
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireMarketing();
  const query = await searchParams;
  if (query.view === "submissions") {
    const dates = query.submissionStart && query.submissionEnd
      ? `?from=${encodeURIComponent(query.submissionStart)}&to=${encodeURIComponent(query.submissionEnd)}` : "";
    redirect(`/marketing${dates}`);
  }
  const creatives = query.view === "creatives";
  const report = reportingRange(query);
  return <div className={!creatives ? "pp-marketing-print-report" : undefined}>
    <nav aria-label="Marketing views" className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 print:hidden">
      <div className="flex flex-wrap gap-2">
        <Link href="/marketing" aria-current={!creatives ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${!creatives ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Campaign results</Link>
        <Link href="/marketing?view=creatives" aria-current={creatives ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${creatives ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Creative performance</Link>
      </div>
    </nav>
    {creatives ? <MetaCreativePerformance searchParams={query} /> : <>
      <p className="mb-5 text-sm text-gray-600">Follow Pet Resort and Mobile Grooming ad spend through website leads and MoeGo outcomes. Use Creative performance to compare individual Meta ads.
        {session.user.role === "SUPER_ADMIN" && <> <Link href="/finance/moego" className="font-medium text-blue-700 underline">Refresh MoeGo orders in Finance</Link>.</>}
      </p>
      <div className="print:hidden">
        <Suspense fallback={<p className="mb-6 text-sm text-gray-500">Loading filters…</p>}>
          <CampaignReportFilters from={report.from} to={report.to} source={report.source} days={report.days} />
        </Suspense>
      </div>
      <p className="mb-5 text-sm text-gray-600">Showing <strong>Pet Resort and Mobile Grooming</strong> · {report.label}</p>
      <Suspense fallback={<p className="text-sm text-gray-500">Loading campaign results…</p>}>
        <Results from={report.from} to={report.to} source={report.source} rangeLabel={report.label} />
      </Suspense>
    </>}
  </div>;
}
