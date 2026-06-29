import { requireMarketing } from "@/lib/auth-helpers";
import { AdReportingDashboard } from "./AdReportingDashboard";

export default async function MarketingAdReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; month?: string; year?: string }>;
}) {
  await requireMarketing();
  const params = await searchParams;
  const business = params.business ?? "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Ad Reporting</h1>
        <p className="mt-1 text-gray-500">Ad KPIs and campaign reporting</p>
      </div>

      <AdReportingDashboard business={business} month={params.month} year={params.year} />
    </div>
  );
}
