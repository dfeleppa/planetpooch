import { requireSuperAdmin } from "@/lib/auth-helpers";
import { FinanceDashboard } from "./FinanceDashboard";

export default async function FinanceDashboardPage({
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
        <p className="text-gray-500 mt-1">
          Financial overview and reporting for Planet Pooch
        </p>
      </div>

      <FinanceDashboard business={business} month={params.month} year={params.year} />
    </div>
  );
}
