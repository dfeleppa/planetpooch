import { requireSuperAdmin } from "@/lib/auth-helpers";
import { GhlDataView } from "./GhlDataView";

export default async function FinanceDataPage() {
  await requireSuperAdmin();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Data</h1>
        <p className="text-gray-500 mt-1">
          GoHighLevel opportunity data — monetary values by status, source, and
          attribution
        </p>
      </div>

      <GhlDataView />
    </div>
  );
}
