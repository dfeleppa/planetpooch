import { requireSuperAdmin } from "@/lib/auth-helpers";
import { MoegoDashboard } from "./MoegoDashboard";

export default async function MoegoPage() {
  await requireSuperAdmin();
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">MoeGo</h1>
        <p className="text-gray-500 mt-1">
          Lead source, LTV, and CAC pulled from MoeGo (customers, orders,
          leads) and joined with Meta ad spend.
        </p>
      </div>
      <MoegoDashboard />
    </div>
  );
}
