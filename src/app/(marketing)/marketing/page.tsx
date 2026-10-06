import Link from "next/link";
import { getActiveBusiness } from "@/lib/business-server";
import { requireMarketing } from "@/lib/auth-helpers";
import { AdReportingDashboard } from "./ad-reporting/AdReportingDashboard";
import { MetaCreativePerformance } from "./evaluate/MetaCreativePerformance";
import { LeadOutcomesReport } from "./ad-reporting/LeadOutcomesReport";
import { WebsiteAttributionReport } from "./website-attribution/Report";

type SearchParams = { view?: string; month?: string; year?: string; range?: string; source?: string; submissionStart?: string; submissionEnd?: string; page?: string; days?: string; from?: string; to?: string; campaign?: string; sort?: string; dir?: string };

export default async function MarketingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireMarketing();
  const query = await searchParams;
  const submissions = query.view === "submissions";
  const creatives = query.view === "creatives";
  const outcomes = query.view === "outcomes";
  const business = await getActiveBusiness();
  return <div>
    <nav aria-label="Marketing views" className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 pb-4">
      <Link href="/marketing" aria-current={!submissions && !creatives && !outcomes ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${!submissions && !creatives && !outcomes ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Campaigns and leads</Link>
      <Link href="/marketing?view=creatives" aria-current={creatives ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${creatives ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Creative performance</Link>
      <Link href="/marketing?view=outcomes" aria-current={outcomes ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${outcomes ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>MoeGo lead outcomes</Link>
      <Link href="/marketing?view=submissions" aria-current={submissions ? "page" : undefined} className={`rounded-lg px-4 py-2 text-sm font-medium ${submissions ? "bg-gray-900 text-white" : "bg-white text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50"}`}>Form Submissions</Link>
      <Link href="/marketing/evaluate" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50">Evaluate Ads</Link>
      <Link href="/marketing/create" className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50">Create Ads</Link>
    </nav>
    {submissions ? <WebsiteAttributionReport searchParams={searchParams} /> : outcomes ? <LeadOutcomesReport days={query.days} from={query.from} to={query.to} /> : creatives ? <MetaCreativePerformance searchParams={query} /> : <>
      <p className="mb-5 text-sm text-gray-500">Review campaign spend and attributed submissions across Meta and Google.</p>
      <AdReportingDashboard business={business.key} month={query.month} year={query.year} range={query.range} source={query.source} />
    </>}
  </div>;
}
