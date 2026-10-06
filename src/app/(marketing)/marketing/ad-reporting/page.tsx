import { getActiveBusiness } from "@/lib/business-server";
import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { AdReportingDashboard } from "./AdReportingDashboard";
import { MetaCreativePerformance } from "../evaluate/MetaCreativePerformance";
import { LeadOutcomesReport } from "./LeadOutcomesReport";

type SearchParams = {
  month?: string;
  year?: string;
  range?: string;
  source?: string;
  view?: string;
  days?: string;
  from?: string;
  to?: string;
  campaign?: string;
  sort?: string;
  dir?: string;
};

export default async function AdReportingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireMarketing();
  const query = await searchParams;
  const business = await getActiveBusiness();
  const creatives = query.view === "creatives";
  const outcomes = query.view === "outcomes";

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-gray-900">Reporting</h2>
        <p className="mt-1 text-sm text-gray-500">Review campaign spend, attributed submissions, and creative performance.</p>
      </div>
      <nav className="pp-tabs mb-5" aria-label="Reporting views">
        <Link href="/marketing/ad-reporting" className={`pp-tab ${!creatives && !outcomes ? "is-on" : ""}`} aria-current={!creatives && !outcomes ? "page" : undefined}>Campaigns and leads</Link>
        <Link href="/marketing/ad-reporting?view=creatives" className={`pp-tab ${creatives ? "is-on" : ""}`} aria-current={creatives ? "page" : undefined}>Creative performance</Link>
        <Link href="/marketing/ad-reporting?view=outcomes" className={`pp-tab ${outcomes ? "is-on" : ""}`} aria-current={outcomes ? "page" : undefined}>MoeGo lead outcomes</Link>
      </nav>
      {outcomes ? (
        <LeadOutcomesReport days={query.days} from={query.from} to={query.to} />
      ) : creatives ? (
        <MetaCreativePerformance searchParams={query} />
      ) : (
        <AdReportingDashboard
          business={business.key}
          month={query.month}
          year={query.year}
          range={query.range}
          source={query.source}
        />
      )}
    </div>
  );
}
