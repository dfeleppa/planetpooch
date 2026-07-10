import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { AdReportingDashboard } from "../ad-reporting/AdReportingDashboard";
import { MetaCreativePerformance } from "./MetaCreativePerformance";

type SearchParams = {
  view?: string;
  business?: string;
  month?: string;
  year?: string;
  days?: string;
  campaign?: string;
  link?: string;
  sort?: string;
  dir?: string;
};

export default async function EvaluateAdsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireMarketing();
  const query = await searchParams;
  const view = query.view === "creatives" ? "creatives" : "overview";

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Evaluate ads</h2>
          <p className="mt-1 text-sm text-gray-500">Decide what to scale, improve, or stop across Meta and Google.</p>
        </div>
        <Link href="/marketing/create/new" className="text-sm font-medium text-blue-700 hover:underline">Create from a new brief →</Link>
      </div>

      <nav className="pp-tabs mb-5" aria-label="Ad evaluation views">
        <Link href="/marketing/evaluate" className={`pp-tab ${view === "overview" ? "is-on" : ""}`} aria-current={view === "overview" ? "page" : undefined}>Overview & campaigns</Link>
        <Link href="/marketing/evaluate?view=creatives" className={`pp-tab ${view === "creatives" ? "is-on" : ""}`} aria-current={view === "creatives" ? "page" : undefined}>Creative performance</Link>
      </nav>

      {view === "overview" ? (
        <AdReportingDashboard business={query.business ?? ""} month={query.month} year={query.year} />
      ) : (
        <MetaCreativePerformance searchParams={query} />
      )}
    </div>
  );
}
