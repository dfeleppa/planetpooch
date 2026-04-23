import { requireManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Company, Role } from "@prisma/client";
import { OrgChartClient } from "./OrgChartClient";

export default async function OrgChartPage() {
  const session = await requireManager();
  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const users = await prisma.user.findMany({
    where: { ...companyFilter },
    orderBy: [{ company: "asc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      role: true,
      company: true,
      jobTitle: true,
      managerId: true,
    },
  });

  const canViewBothCompanies = !companyFilter.company;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Org Chart</h1>
        <p className="text-gray-500 mt-1">
          Visualize and reorganize the reporting structure. Drag employees onto a manager to update who they report to.
        </p>
      </div>
      <OrgChartClient
        initialUsers={users}
        canViewBothCompanies={canViewBothCompanies}
        lockedCompany={companyFilter.company ?? null}
      />
    </div>
  );
}
