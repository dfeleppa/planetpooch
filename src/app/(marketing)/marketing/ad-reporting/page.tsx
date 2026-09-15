import { getActiveBusiness } from "@/lib/business-server";
import { requireMarketing } from "@/lib/auth-helpers";
import { AdReportingDashboard } from "./AdReportingDashboard";

type SearchParams = {
  month?: string;
  year?: string;
  source?: string;
};

export default async function AdReportingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireMarketing();
  const query = await searchParams;
  const business = await getActiveBusiness();

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-gray-900">Reporting</h2>
        <p className="mt-1 text-sm text-gray-500">Review campaign spend and results across Meta and Google.</p>
      </div>
      <AdReportingDashboard
        business={business.key}
        month={query.month}
        year={query.year}
        source={query.source}
      />
    </div>
  );
}
