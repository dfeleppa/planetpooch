import { requireSuperAdmin } from "@/lib/auth-helpers";
import { listMoegoBusinesses } from "@/lib/moego/businesses";
import { MoegoDashboard } from "./MoegoDashboard";

export default async function MoegoPage() {
  await requireSuperAdmin();
  const businesses = await listMoegoBusinesses();
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">MoeGo</h2>
        <p className="text-gray-500 mt-1">
          Lead source, LTV, and CAC pulled from MoeGo (customers, orders,
          leads) and joined with Meta ad spend.
        </p>
      </div>
      <MoegoDashboard businesses={businesses} />
    </div>
  );
}
