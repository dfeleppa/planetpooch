import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { AdReportingDashboard } from "./ad-reporting/AdReportingDashboard";
import { MetaCreativePerformance } from "./evaluate/MetaCreativePerformance";
import { LeadOutcomesReport } from "./ad-reporting/LeadOutcomesReport";
import { WebsiteAttributionReport } from "./website-attribution/Report";
import { CampaignReportFilters } from "./ad-reporting/CampaignReportFilters";
import { reportingRange } from "./ad-reporting/report-range";
import { LeadAttributionDashboard } from "./ad-reporting/LeadAttributionDashboard";
import { Suspense } from "react";

type SearchParams = { view?: string; month?: string; year?: string; range?: string; source?: string; submissionStart?: string; submissionEnd?: string; page?: string; days?: string; from?: string; to?: string; campaign?: string; sort?: string; dir?: string };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await requireMarketing();
  const query = await searchParams;
  const submissions = query.view === "submissions";
  const creatives = query.view === "creatives";
  const report = reportingRange(query);
  return <div>
    <nav aria-label="Marketing views" className="mb-6 flex flex-wrap items-center gap-3 border-b border-gray-200 pb-4">
      <div className="flex flex-wrap gap-2">
        <Link href="/marketing" aria-current={!submissions && !creatives ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${!submissions && !creatives ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Campaign results</Link>
        <Link href="/marketing?view=creatives" aria-current={creatives ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${creatives ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Creative performance</Link>
        <Link href="/marketing?view=submissions" aria-current={submissions ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${submissions ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Form Submissions</Link>
      </div>
    </nav>
    {submissions ? <WebsiteAttributionReport searchParams={searchParams} /> : creatives ? <MetaCreativePerformance searchParams={query} /> : <>
      <p className="mb-5 text-sm text-gray-600">Follow Pet Resort and Mobile Grooming ad spend through website leads and MoeGo outcomes. Use Creative performance to compare individual Meta ads.
        {session.user.role === "SUPER_ADMIN" && <> <Link href="/finance/moego" className="font-medium text-blue-700 underline">Refresh MoeGo orders in Finance</Link>.</>}
      </p>
      <Suspense fallback={<p className="mb-6 text-sm text-gray-500">Loading filters…</p>}>
        <CampaignReportFilters from={report.from} to={report.to} source={report.source} days={report.days} />
      </Suspense>
      <p className="mb-5 text-sm text-gray-600">Showing <strong>Pet Resort and Mobile Grooming</strong> · {report.label}</p>
      <section aria-labelledby="spend-heading">
        <h2 id="spend-heading" className="text-lg font-semibold text-gray-900">1. Spend and observed MoeGo revenue</h2>
        <p className="mt-1 text-sm text-gray-600">Meta spend is synced from Ads Manager. MoeGo revenue is assigned only to a recorded, linked website lead; Google spend comes from date-matched CSV imports.</p>
        <AdReportingDashboard business="" from={report.from} to={report.to} source={report.source} rangeLabel={report.label} />
      </section>
      <section aria-labelledby="website-leads-heading" className="mt-8 border-t border-gray-200 pt-7">
        <h2 id="website-leads-heading" className="text-lg font-semibold text-gray-900">2. Submitted website leads</h2>
        <p className="mt-1 text-sm text-gray-600">Real form submissions with captured source and campaign information. These can differ from leads reported inside Meta.</p>
        <LeadAttributionDashboard from={report.from} to={report.to} source={report.source} />
      </section>
      <section aria-labelledby="outcomes-heading" className="mt-8 border-t border-gray-200 pt-7">
        <h2 id="outcomes-heading" className="text-lg font-semibold text-gray-900">3. MoeGo outcomes</h2>
        <p className="mt-1 mb-5 text-sm text-gray-600">See which submitted leads became bookings and paid customers.</p>
        <Suspense fallback={<p className="text-sm text-gray-500">Loading MoeGo outcomes…</p>}>
          <LeadOutcomesReport from={report.from} to={report.to} source={report.source} />
        </Suspense>
      </section>
    </>}
  </div>;
}
