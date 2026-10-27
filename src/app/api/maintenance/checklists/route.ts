import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/maintenance/checklists?date=YYYY-MM-DD
 * Returns every checklist item relevant to that day: all active items,
 * plus archived items that were checked off on that day (so history stays
 * faithful after a manager removes an item).
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam || !DATE_RE.test(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const date = new Date(dateParam);

  const weekDate = new Date(date);
  weekDate.setUTCDate(weekDate.getUTCDate() - weekDate.getUTCDay());

  const items = await prisma.dailyChecklistItem.findMany({
    where: {
      OR: [{ isActive: true }, { completions: { some: { date: { in: [date, weekDate] } } } }],
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      completions: {
        where: { date: { in: [date, weekDate] } },
        include: { completedBy: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    date: dateParam,
    items: items.filter((item) => item.isActive || item.completions.some((c) =>
      c.date.getTime() === (item.period === "WEEKLY" ? weekDate : date).getTime()
    )).map((item) => {
      const targetDate = item.period === "WEEKLY" ? weekDate : date;
      const completion = item.completions.find((c) => c.date.getTime() === targetDate.getTime()) ?? null;
      return {
        id: item.id,
        period: item.period,
        title: item.title,
        order: item.order,
        isActive: item.isActive,
        completion: completion
          ? {
              completedAt: completion.completedAt.toISOString(),
              completedByName: completion.completedBy?.name ?? null,
            }
          : null,
      };
    }),
  });
}
