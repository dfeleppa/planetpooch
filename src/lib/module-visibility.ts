import { prisma } from "@/lib/prisma";
import { Company } from "@prisma/client";

type ModuleVisibilityTarget = {
  id: string;
  jobTitle: string | null;
  company?: Company | null;
};

/**
 * Returns the set of module IDs visible to a user. A module is visible if:
 *   - It has no job-title assignments AND no user assignments (open module), OR
 *   - One of its job-title assignments matches the user's `jobTitle` and
 *     company, OR
 *   - The user is in its `userAssignments`.
 *
 * Admin/manager views should NOT use this — they see every module regardless.
 */
export async function getVisibleModuleIdsForUser(
  userId: string,
  jobTitle: string | null,
  company?: Company | null,
): Promise<Set<string>> {
  const visibleByUser = await getVisibleModuleIdsForUsers([
    { id: userId, jobTitle, company },
  ]);

  return visibleByUser.get(userId) ?? new Set();
}

/**
 * Batched form of getVisibleModuleIdsForUser for roster/progress views.
 */
export async function getVisibleModuleIdsForUsers(
  users: ModuleVisibilityTarget[],
): Promise<Map<string, Set<string>>> {
  const visibleByUser = new Map(users.map((user) => [user.id, new Set<string>()]));
  if (users.length === 0) return visibleByUser;

  const modules = await prisma.module.findMany({
    select: {
      id: true,
      _count: { select: { jobTitleAssignments: true, userAssignments: true } },
      jobTitleAssignments: {
        select: { jobTitle: true, company: true },
      },
      userAssignments: {
        where: { userId: { in: users.map((user) => user.id) } },
        select: { userId: true },
      },
    },
  });

  for (const mod of modules) {
    const isOpen =
      mod._count.jobTitleAssignments === 0 && mod._count.userAssignments === 0;
    const directlyAssignedUserIds = new Set(
      mod.userAssignments.map((assignment) => assignment.userId),
    );

    for (const user of users) {
      if (isOpen) {
        visibleByUser.get(user.id)!.add(mod.id);
        continue;
      }
      if (directlyAssignedUserIds.has(user.id)) {
        visibleByUser.get(user.id)!.add(mod.id);
        continue;
      }
      if (
        user.jobTitle &&
        mod.jobTitleAssignments.some(
          (assignment) =>
            assignment.jobTitle === user.jobTitle &&
            (assignment.company === null || assignment.company === user.company),
        )
      ) {
        visibleByUser.get(user.id)!.add(mod.id);
      }
    }
  }

  return visibleByUser;
}

/** True if a single module is visible to a user. */
export async function isModuleVisibleToUser(
  moduleId: string,
  userId: string,
  jobTitle: string | null,
  company?: Company | null,
): Promise<boolean> {
  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    select: {
      _count: { select: { jobTitleAssignments: true, userAssignments: true } },
    },
  });
  if (!mod) return false;
  if (mod._count.jobTitleAssignments === 0 && mod._count.userAssignments === 0) {
    return true;
  }

  if (jobTitle) {
    const jt = await prisma.moduleJobTitleAssignment.findFirst({
      where: {
        moduleId,
        jobTitle,
        OR: [{ company: null }, ...(company ? [{ company }] : [])],
      },
      select: { id: true },
    });
    if (jt) return true;
  }

  const ua = await prisma.moduleUserAssignment.findUnique({
    where: { moduleId_userId: { moduleId, userId } },
    select: { id: true },
  });
  return !!ua;
}
