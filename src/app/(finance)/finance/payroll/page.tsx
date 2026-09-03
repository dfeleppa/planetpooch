import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PayrollSubnav } from "./PayrollSubnav";
import {
  PetResortPayrollLedger,
  type PetResortPayrollRunRow,
} from "./PetResortPayrollLedger";

export default async function PetResortPayrollPage() {
  await requireSuperAdmin();

  const payrollRuns = await prisma.financePetResortPayrollRun.findMany({
    orderBy: [{ checkDate: "desc" }, { payRunAt: "desc" }],
  });
  const rows: PetResortPayrollRunRow[] = payrollRuns.map((run) => ({
    id: run.id,
    payrollType: run.payrollType,
    checkDate: run.checkDate.toISOString().slice(0, 10),
    amount: run.amount.toString(),
    payPeriod: run.payPeriod,
    schedule: run.schedule,
    payRunAt: run.payRunAt.toISOString(),
  }));

  return (
    <div className="space-y-5">
      <PayrollSubnav active="pet-resort" />
      <div>
        <h2 className="text-xl font-semibold text-gray-900">Payroll</h2>
        <p className="mt-1 text-gray-500">Pet Resort payroll runs uploaded through Supabase</p>
      </div>
      <PetResortPayrollLedger rows={rows} />
    </div>
  );
}
