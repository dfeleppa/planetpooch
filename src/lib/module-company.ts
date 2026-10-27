import type { Prisma } from "@prisma/client";
import type { BusinessCompany } from "./business";

/** Open modules and assignments shared across companies appear in both views. */
export function moduleCompanyWhere(company: BusinessCompany): Prisma.ModuleWhereInput {
  return {
    OR: [
      { jobTitleAssignments: { none: {} }, userAssignments: { none: {} } },
      { jobTitleAssignments: { some: { OR: [{ company }, { company: null }] } } },
      { userAssignments: { some: { user: { company } } } },
    ],
  };
}
