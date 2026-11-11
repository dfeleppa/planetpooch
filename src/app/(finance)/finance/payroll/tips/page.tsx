import { Company } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { PayrollSubnav } from "../PayrollSubnav";
import { ResortTips } from "./ResortTips";
import { DesignatedTips } from "./DesignatedTips";
import { designatedTipEmployeeIds } from "./designated-employees";

export default async function ResortTipsPage() {
  await requireSuperAdmin();
  if ((await getActiveBusiness()).company !== "RESORT") redirect("/finance/payroll/mobile-grooming");
  const [employees, designatedEmployees, designatedTips, runs] = await Promise.all([
    prisma.user.findMany({ where: { company: Company.RESORT, role: { not: "FRONT_DESK" }, terminatedAt: null, id: { notIn: designatedTipEmployeeIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.user.findMany({ where: { company: Company.RESORT, id: { in: designatedTipEmployeeIds } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.financeResortDesignatedTip.findMany({ where: { employeeId: { in: designatedTipEmployeeIds } }, orderBy: { periodEnd: "desc" } }),
    prisma.financeResortTipRun.findMany({ include: { allocations: { orderBy: { employeeName: "asc" } } }, orderBy: [{ payDate: "desc" }, { createdAt: "desc" }] }),
  ]);
  return <div className="space-y-5">
    <PayrollSubnav active="tips" />
    <div><h2 className="text-xl font-semibold text-gray-900">Tips</h2><p className="mt-1 text-gray-500">Resort tip payments and hours-based allocation</p></div>
    <section aria-labelledby="designated-tips" className="space-y-3">
      <h3 id="designated-tips" className="text-lg font-semibold text-gray-900">Designated tips</h3>
      <div className="grid gap-4 xl:grid-cols-2">
        {designatedEmployees.map((employee) => {
          const records = designatedTips.filter((tip) => tip.employeeId === employee.id);
          const nextStart = records.length ? new Date(records[0].periodEnd.getTime() + 86_400_000).toISOString().slice(0, 10) : "";
          return <DesignatedTips key={employee.id} employee={employee} nextStart={nextStart} records={records.map((tip) => ({
            id: tip.id,
            periodStart: tip.periodStart.toISOString().slice(0, 10),
            periodEnd: tip.periodEnd.toISOString().slice(0, 10),
            paidDate: tip.paidDate.toISOString().slice(0, 10),
            amountCents: tip.amountCents,
          }))} />;
        })}
      </div>
    </section>
    <ResortTips employees={employees} runs={runs.map((run) => ({
      id: run.id, payDate: run.payDate.toISOString().slice(0, 10),
      periodStart: run.periodStart.toISOString().slice(0, 10), periodEnd: run.periodEnd.toISOString().slice(0, 10),
      totalCents: run.totalCents,
      allocations: run.allocations.map((row) => ({ id: row.id, name: row.employeeName, hoursHundredths: row.hoursHundredths, amountCents: row.amountCents })),
    }))} />
  </div>;
}
