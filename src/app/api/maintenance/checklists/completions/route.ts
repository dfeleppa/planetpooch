import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * POST /api/maintenance/checklists/completions
 * Body: { itemId: string, date: "YYYY-MM-DD", completed: boolean }
 * Checks or unchecks one item for one day. Any authenticated employee can
 * do this; the completion records who and when.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const body = await req.json().catch(() => null);
  const itemId = typeof body?.itemId === "string" ? body.itemId : null;
  const dateParam = typeof body?.date === "string" ? body.date : null;
  const completed = typeof body?.completed === "boolean" ? body.completed : null;
  if (!itemId || !dateParam || !DATE_RE.test(dateParam) || completed === null) {
    return NextResponse.json(
      { error: "itemId, date (YYYY-MM-DD), and completed are required" },
      { status: 400 }
    );
  }

  // Loose future guard — a day of slack covers timezone differences between
  // the server and the facility, while still blocking "sign off next week".
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  if (new Date(dateParam) > tomorrow) {
    return NextResponse.json({ error: "Cannot sign off a future date" }, { status: 400 });
  }

  const item = await prisma.dailyChecklistItem.findUnique({ where: { id: itemId } });
  if (!item) return NextResponse.json({ error: "Item not found" }, { status: 404 });

  const date = new Date(dateParam);

  if (!completed) {
    await prisma.dailyChecklistCompletion.deleteMany({ where: { itemId, date } });
    return NextResponse.json({ itemId, date: dateParam, completion: null });
  }

  const completion = await prisma.dailyChecklistCompletion.upsert({
    where: { itemId_date: { itemId, date } },
    // Already checked by someone else — keep their sign-off, don't overwrite.
    update: {},
    create: { itemId, date, completedById: userId },
    include: { completedBy: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    itemId,
    date: dateParam,
    completion: {
      completedAt: completion.completedAt.toISOString(),
      completedByName: completion.completedBy?.name ?? null,
    },
  });
}
