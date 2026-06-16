import { requireSuperAdmin } from "@/lib/auth-helpers";
import { PayrollDashboard } from "./PayrollDashboard";

export default async function PayrollPage() {
  await requireSuperAdmin();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Payroll</h1>
        <p className="text-gray-500 mt-1">Weekly staff hours by category</p>
      </div>

      <PayrollDashboard />
    </div>
  );
}
