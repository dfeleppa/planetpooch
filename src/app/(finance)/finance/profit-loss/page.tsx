import { requireSuperAdmin } from "@/lib/auth-helpers";
import { WeeklyFinancialSnapshot } from "../WeeklyFinancialSnapshot";
import { MoegoDashboard } from "../moego/MoegoDashboard";
import { getActiveBusiness } from "@/lib/business-server";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; week?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;
  const business = await getActiveBusiness();
  const businesses = [{ id: business.moegoId, label: business.label }];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Profit & Loss</h2>
        <p className="mt-1 text-gray-500">Weekly financial snapshot for {business.label}</p>
      </div>

      <WeeklyFinancialSnapshot year={params.year} week={params.week} />

      <section
        id="moego"
        aria-labelledby="moego-heading"
        className="mt-10 scroll-mt-6 border-t border-gray-200 pt-8"
      >
        <div className="mb-6">
          <h2 id="moego-heading" className="text-xl font-semibold text-gray-900">
            MoeGo
          </h2>
          <p className="mt-1 text-gray-500">
            Lead source, LTV, and CAC pulled from MoeGo (customers, orders,
            leads) and joined with Meta ad spend.
          </p>
        </div>
        <MoegoDashboard key={business.moegoId} businesses={businesses} />
      </section>
    </div>
  );
}
