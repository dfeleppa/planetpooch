import { requireManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Company, Role } from "@prisma/client";
import { OrgChartClient } from "./OrgChartClient";

export default async function OrgChartPage() {
  const session = await requireManager();
  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  // MANAGERs see their own company's positions + cross-company leadership
  const positionWhere = companyFilter.company
    ? { OR: [{ company: companyFilter.company }, { company: null }] }
    : {};

  const [positions, users] = await Promise.all([
    prisma.orgPosition.findMany({
      where: positionWhere,
      orderBy: [{ company: "asc" }, { order: "asc" }],
      select: {
        id: true,
        title: true,
        company: true,
        parentPositionId: true,
        assignedUserId: true,
        order: true,
      },
    }),
    prisma.user.findMany({
      where: { ...companyFilter, terminatedAt: null },
      orderBy: [{ company: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,
        jobTitle: true,
      },
    }),
  ]);

  const canViewBothCompanies = !companyFilter.company;
  const isSuperAdmin =
    sessionUser.role === "SUPER_ADMIN" ||
    (sessionUser.role as string) === "DOS" ||
    (sessionUser.role as string) === "ADMIN";

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Org Chart</h1>
        <p className="text-gray-500 mt-1">
          Visualize your org structure with positions — vacant or filled. Drag a position onto
          another to change who it reports to. Assign employees to positions, or leave them vacant.
        </p>
      </div>
      <OrgChartClient
        initialPositions={positions}
        initialUsers={users}
        canViewBothCompanies={canViewBothCompanies}
        lockedCompany={companyFilter.company ?? null}
        isSuperAdmin={isSuperAdmin}
      />
    </div>
  );
}
