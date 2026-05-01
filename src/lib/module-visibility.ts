import { prisma } from "@/lib/prisma";

/**
 * Returns the set of module IDs visible to a user. A module is visible if:
 *   - It has no job-title assignments AND no user assignments (open module), OR
 *   - One of its job-title assignments matches the user's `jobTitle`, OR
 *   - The user is in its `userAssignments`.
 *
 * Admin/manager views should NOT use this — they see every module regardless.
 */
export async function getVisibleModuleIdsForUser(
  userId: string,
  jobTitle: string | null,
): Promise<Set<string>> {
  const [allModules, openModuleRows, jobTitleRows, userRows] = await Promise.all([
    prisma.module.findMany({ select: { id: true } }),
    prisma.module.findMany({
      where: {
        jobTitleAssignments: { none: {} },
        userAssignments: { none: {} },
      },
      select: { id: true },
    }),
    jobTitle
      ? prisma.moduleJobTitleAssignment.findMany({
          where: { jobTitle },
          select: { moduleId: true },
        })
      : Promise.resolve([] as { moduleId: string }[]),
    prisma.moduleUserAssignment.findMany({
      where: { userId },
      select: { moduleId: true },
    }),
  ]);

  const visible = new Set<string>();
  for (const m of openModuleRows) visible.add(m.id);
  for (const r of jobTitleRows) visible.add(r.moduleId);
  for (const r of userRows) visible.add(r.moduleId);

  // Defensive: only return IDs that still exist
  const existing = new Set(allModules.map((m) => m.id));
  return new Set([...visible].filter((id) => existing.has(id)));
}

/** True if a single module is visible to a user. */
export async function isModuleVisibleToUser(
  moduleId: string,
  userId: string,
  jobTitle: string | null,
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
    const jt = await prisma.moduleJobTitleAssignment.findUnique({
      where: { moduleId_jobTitle: { moduleId, jobTitle } },
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
