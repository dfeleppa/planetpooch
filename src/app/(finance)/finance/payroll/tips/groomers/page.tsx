import { Company } from "@prisma/client";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { PayrollSubnav } from "../../PayrollSubnav";
import { DesignatedTips } from "../DesignatedTips";
import { TipsSubnav } from "../TipsSubnav";
import { designatedTipEmployeeIds } from "../designated-employees";

export default async function GroomerTipsPage() {
  await requireSuperAdmin();
  if ((await getActiveBusiness()).company !== "RESORT") redirect("/finance/payroll/mobile-grooming");

  const [employees, tips] = await Promise.all([
    prisma.user.findMany({
      where: { company: Company.RESORT, id: { in: designatedTipEmployeeIds } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.financeResortDesignatedTip.findMany({
      where: { employeeId: { in: designatedTipEmployeeIds } },
      orderBy: { periodEnd: "desc" },
    }),
  ]);

  return <div className="space-y-5">
    <PayrollSubnav active="tips" />
    <h2 className="text-xl font-semibold text-gray-900">Tips</h2>
    <TipsSubnav active="groomers" />
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {employees.map((employee) => {
        const records = tips.filter((tip) => tip.employeeId === employee.id);
        const latestEnd = records[0]?.periodEnd;
        const nextStart = latestEnd ? new Date(latestEnd.getTime() + 86_400_000).toISOString().slice(0, 10) : "";
        return <DesignatedTips key={employee.id} employee={employee} nextStart={nextStart} records={records.map((tip) => ({
          id: tip.id,
          periodStart: tip.periodStart.toISOString().slice(0, 10),
          periodEnd: tip.periodEnd.toISOString().slice(0, 10),
          paidDate: tip.paidDate.toISOString().slice(0, 10),
          amountCents: tip.amountCents,
        }))} />;
      })}
    </div>
  </div>;
}
