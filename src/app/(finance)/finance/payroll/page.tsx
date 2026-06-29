import { requireSuperAdmin } from "@/lib/auth-helpers";
import { PayrollDashboard } from "./PayrollDashboard";

export default async function PayrollPage() {
  await requireSuperAdmin();

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Payroll</h2>
        <p className="text-gray-500 mt-1">Weekly staff hours by category</p>
      </div>

      <PayrollDashboard />
    </div>
  );
}
