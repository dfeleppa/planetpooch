import type { Prisma } from "@prisma/client";
import type { BusinessCompany } from "./business";
import { prisma } from "./prisma";

/** Resolve legacy title-only assignments using the same company roles as the assignment editor. */
export async function moduleCompanyWhere(company: BusinessCompany): Promise<Prisma.ModuleWhereInput> {
  const [users, positions] = await Promise.all([
    prisma.user.findMany({
      where: { company, jobTitle: { not: null } },
      select: { jobTitle: true },
      distinct: ["jobTitle"],
    }),
    prisma.orgPosition.findMany({
      where: { company },
      select: { title: true },
      distinct: ["title"],
    }),
  ]);
  const titles = [...new Set([
    ...users.flatMap(({ jobTitle }) => jobTitle?.trim() ? [jobTitle] : []),
    ...positions.flatMap(({ title }) => title.trim() ? [title] : []),
  ])];
  return {
    OR: [
      { jobTitleAssignments: { none: {} }, userAssignments: { none: {} } },
      { jobTitleAssignments: { some: { OR: [{ company }, { company: null, jobTitle: { in: titles } }] } } },
      { userAssignments: { some: { user: { company } } } },
    ],
  };
}
