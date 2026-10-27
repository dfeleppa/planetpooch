import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { canAccessMaintenanceCompany } from "@/lib/maintenance-access";

/**
 * PUT /api/maintenance/checklists/items/reorder
 * Body: { period: "AM" | "PM" | "WEEKLY", orderedIds: string[] }
 * Rewrites the order of a period's active items to match orderedIds.
 * Managers only.
 */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canAccessMaintenanceCompany(session.user, "RESORT")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isManagerOrAbove((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const period = body?.period === "AM" || body?.period === "PM" || body?.period === "WEEKLY" ? body.period : null;
  const orderedIds: unknown = body?.orderedIds;
  if (!period || !Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return NextResponse.json(
      { error: "period (AM|PM|WEEKLY) and orderedIds (string[]) are required" },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    (orderedIds as string[]).map((id, index) =>
      prisma.dailyChecklistItem.updateMany({
        where: { id, period },
        data: { order: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
