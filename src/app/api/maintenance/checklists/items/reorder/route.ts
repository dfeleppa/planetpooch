import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canAccessChecklist, canEditChecklists } from "@/lib/checklist-access";

/**
 * PUT /api/maintenance/checklists/items/reorder
 * Body: { period: "DAILY" | "WEEKLY", orderedIds: string[] }
 * Rewrites the order of a period's active items to match orderedIds.
 * Managers only.
 */
export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditChecklists(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const department = body?.department ?? "BOARDING";
  if (!["BOARDING", "GROOMING", "FRONT_DESK"].includes(department)) {
    return NextResponse.json({ error: "Invalid checklist department" }, { status: 400 });
  }

  if (!canAccessChecklist(session.user, department)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const period = body?.period === "DAILY" || body?.period === "WEEKLY" ? body.period : null;
  const orderedIds: unknown = body?.orderedIds;
  if (!period || !Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return NextResponse.json(
      { error: "period (DAILY|WEEKLY) and orderedIds (string[]) are required" },
      { status: 400 }
    );
  }

  await prisma.$transaction(
    (orderedIds as string[]).map((id, index) =>
      prisma.dailyChecklistItem.updateMany({
        where: { id, department, period },
        data: { order: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
