import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canEditChecklists } from "@/lib/checklist-access";

async function requireManagerSession() {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!canEditChecklists(session.user)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { session };
}

/**
 * PATCH /api/maintenance/checklists/items/:itemId
 * Body: { title: string } — rename an item. Managers only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { error } = await requireManagerSession();
  if (error) return error;

  const { itemId } = await params;
  const body = await req.json().catch(() => null);
  const title = typeof body?.title === "string" ? body.title.trim() : "";
  const hasDueWeekday = body && Object.prototype.hasOwnProperty.call(body, "dueWeekday");
  const dueWeekday = body?.dueWeekday;
  if (hasDueWeekday && dueWeekday !== null && (!Number.isInteger(dueWeekday) || dueWeekday < 0 || dueWeekday > 6)) {
    return NextResponse.json({ error: "dueWeekday must be null or 0 through 6" }, { status: 400 });
  }
  if (!title && !hasDueWeekday) return NextResponse.json({ error: "title or dueWeekday is required" }, { status: 400 });
  let weeklyScheduledAt: Date | null = null;
  if (hasDueWeekday) {
    const existing = await prisma.dailyChecklistItem.findUnique({ where: { id: itemId } });
    if (!existing) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    weeklyScheduledAt = existing.weeklyScheduledAt ?? new Date();
    if (existing.period !== "WEEKLY") return NextResponse.json({ error: "Only weekly tasks can have a due weekday" }, { status: 400 });
  }

  const item = await prisma.dailyChecklistItem
    .update({ where: { id: itemId }, data: { ...(title ? { title } : {}), ...(hasDueWeekday ? { dueWeekday, weeklyScheduledAt: dueWeekday === null ? null : weeklyScheduledAt } : {}) } })
    .catch(() => null);
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  return NextResponse.json(item);
}

/**
 * DELETE /api/maintenance/checklists/items/:itemId
 * Removes an item from the checklist. If it has any historical completions
 * it is archived (isActive=false) so past days keep their records; otherwise
 * it is deleted outright. Managers only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { error } = await requireManagerSession();
  if (error) return error;

  const { itemId } = await params;
  const completionCount = await prisma.dailyChecklistCompletion.count({ where: { itemId } });

  if (completionCount > 0) {
    const item = await prisma.dailyChecklistItem
      .update({ where: { id: itemId }, data: { isActive: false } })
      .catch(() => null);
    if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });
    return NextResponse.json({ archived: true });
  }

  const deleted = await prisma.dailyChecklistItem
    .delete({ where: { id: itemId } })
    .catch(() => null);
  if (!deleted) return NextResponse.json({ error: "Item not found" }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
