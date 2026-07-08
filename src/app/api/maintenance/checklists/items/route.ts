import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";

/**
 * POST /api/maintenance/checklists/items
 * Body: { period: "AM" | "PM", title: string }
 * Appends a new item to the end of that period's checklist. Managers only.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const period = body?.period === "AM" || body?.period === "PM" ? body.period : null;
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  if (!period || !title) {
    return NextResponse.json({ error: "period (AM|PM) and title are required" }, { status: 400 });
  }

  const last = await prisma.dailyChecklistItem.aggregate({
    where: { period },
    _max: { order: true },
  });

  const item = await prisma.dailyChecklistItem.create({
    data: { period, title, order: (last._max.order ?? -1) + 1 },
  });

  return NextResponse.json(item, { status: 201 });
}
