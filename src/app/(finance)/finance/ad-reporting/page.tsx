import { requireSuperAdmin } from "@/lib/auth-helpers";
import { FinanceDashboard } from "../FinanceDashboard";
import { FinanceSubnav } from "../FinanceSubnav";

export default async function FinanceAdReportingPage({
  searchParams,
}: {
  searchParams: Promise<{ business?: string; month?: string; year?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const business = params.business ?? "";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Finance</h1>
        <p className="mt-1 text-gray-500">Ad KPIs and campaign reporting</p>
      </div>

      <FinanceSubnav />
      <FinanceDashboard business={business} month={params.month} year={params.year} />
    </div>
  );
}
