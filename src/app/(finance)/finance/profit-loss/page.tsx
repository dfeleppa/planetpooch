import { requireSuperAdmin } from "@/lib/auth-helpers";
import { MoegoDashboard } from "../moego/MoegoDashboard";
import { getActiveBusiness } from "@/lib/business-server";

export default async function ProfitLossPage() {
  await requireSuperAdmin();
  const business = await getActiveBusiness();
  const businesses = [{ id: business.moegoId, label: business.label }];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Profit & Loss</h2>
        <p className="mt-1 text-gray-500">Net sales, estimated expenses, and net profit for {business.label}</p>
      </div>

      <div
        id="moego"
        className="scroll-mt-6"
      >
        <MoegoDashboard key={business.moegoId} businesses={businesses} />
      </div>
    </div>
  );
}
