import { Company } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { PayrollSubnav } from "../PayrollSubnav";
import { ResortTips } from "./ResortTips";

export default async function ResortTipsPage() {
  await requireSuperAdmin();
  if ((await getActiveBusiness()).company !== "RESORT") redirect("/finance/payroll/mobile-grooming");
  const [employees, runs] = await Promise.all([
    prisma.user.findMany({ where: { company: Company.RESORT, terminatedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.financeResortTipRun.findMany({ include: { allocations: { orderBy: { employeeName: "asc" } } }, orderBy: [{ payDate: "desc" }, { createdAt: "desc" }] }),
  ]);
  return <div className="space-y-5">
    <PayrollSubnav active="tips" />
    <div><h2 className="text-xl font-semibold text-gray-900">Tips</h2><p className="mt-1 text-gray-500">Resort tip payments and hours-based allocation</p></div>
    <ResortTips employees={employees} runs={runs.map((run) => ({
      id: run.id, payDate: run.payDate.toISOString().slice(0, 10),
      periodStart: run.periodStart.toISOString().slice(0, 10), periodEnd: run.periodEnd.toISOString().slice(0, 10),
      totalCents: run.totalCents,
      allocations: run.allocations.map((row) => ({ id: row.id, name: row.employeeName, hoursHundredths: row.hoursHundredths, amountCents: row.amountCents })),
    }))} />
  </div>;
}
