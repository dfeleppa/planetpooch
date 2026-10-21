import { NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { reconcilePostPayoutChanges } from "@/lib/mobile-grooming-post-payout";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const weeks = await prisma.financePayrollWeek.findMany({
    where: {
      business: "mobile-grooming",
      OR: [{ mobileGroomingPayLocks: { some: {} } }, { mobileGroomingCloseout: { isNot: null } }],
    },
    select: { id: true, weekStart: true, mobileGroomingEntries: true },
    orderBy: { weekStart: "desc" },
  });
  let checkedCount = 0;
  let lockedCount = 0;
  let discrepancyCount = 0;
  const checkedAt = new Date();
  for (const week of weeks) {
    const result = await prisma.$transaction((tx) => reconcilePostPayoutChanges(
      tx, week.id, week.weekStart, week.mobileGroomingEntries, checkedAt
    ));
    checkedCount += result.checkedCount;
    lockedCount += result?.lockedCount ?? 0;
    discrepancyCount += result?.discrepancyCount ?? 0;
  }
  return NextResponse.json({ checkedCount, lockedCount, discrepancyCount, checkedAt: checkedAt.toISOString() });
}
