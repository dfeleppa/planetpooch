import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";

async function requireManagerSession() {
  const session = await getSession();
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!isManagerOrAbove((session.user as { role?: string }).role)) {
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
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const item = await prisma.dailyChecklistItem
    .update({ where: { id: itemId }, data: { title } })
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
