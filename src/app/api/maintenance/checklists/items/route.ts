import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canAccessChecklist, canEditChecklists } from "@/lib/checklist-access";

/**
 * POST /api/maintenance/checklists/items
 * Body: { period: "DAILY" | "WEEKLY", title: string }
 * Appends a new item to the end of that period's checklist. Managers only.
 */
export async function POST(req: NextRequest) {
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
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!period || !title) {
    return NextResponse.json({ error: "period (DAILY|WEEKLY) and title are required" }, { status: 400 });
  }

  const last = await prisma.dailyChecklistItem.aggregate({
    where: { department, period },
    _max: { order: true },
  });

  const item = await prisma.dailyChecklistItem.create({
    data: { department, period, title, order: (last._max.order ?? -1) + 1 },
  });

  return NextResponse.json(item, { status: 201 });
}
