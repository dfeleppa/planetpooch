import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canAccessChecklist } from "@/lib/checklist-access";

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

  const department = req.nextUrl.searchParams.get("department") ?? "BOARDING";
  if (!["BOARDING", "GROOMING", "FRONT_DESK"].includes(department)) {
    return NextResponse.json({ error: "Invalid checklist department" }, { status: 400 });
  }

  if (!canAccessChecklist(session.user, department)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const dateParam = req.nextUrl.searchParams.get("date");
  if (!dateParam || !DATE_RE.test(dateParam)) {
    return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
  }
  const date = new Date(dateParam);

  const weekDate = new Date(date);
  weekDate.setUTCDate(weekDate.getUTCDate() - weekDate.getUTCDay());

  const items = await prisma.dailyChecklistItem.findMany({
    where: {
      department,
      OR: [{ isActive: true }, { completions: { some: { date: { in: [date, weekDate] } } } }],
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: {
      completions: {
        where: { OR: [{ date: { in: [date, weekDate] } }, { item: { period: "WEEKLY", dueWeekday: { not: null } } }] },
        include: { completedBy: { select: { id: true, name: true } } },
      },
    },
  });

  return NextResponse.json({
    date: dateParam,
    items: items.filter((item) => item.isActive || item.completions.some((c) =>
      c.date.getTime() === (item.period === "WEEKLY" ? weekDate : date).getTime()
    )).map((item) => {
      let targetDate = item.period === "WEEKLY" ? weekDate : date;
      // Keep the oldest unfinished scheduled week visible until it is signed off.
      if (item.period === "WEEKLY" && item.dueWeekday !== null && item.weeklyScheduledAt) {
        const localStart = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(item.weeklyScheduledAt);
        const firstWeek = new Date(localStart);
        firstWeek.setUTCDate(firstWeek.getUTCDate() - firstWeek.getUTCDay());
        const completedWeeks = new Set(item.completions.map((c) => c.date.getTime()));
        for (const candidate = new Date(firstWeek); candidate <= weekDate; candidate.setUTCDate(candidate.getUTCDate() + 7)) {
          if (!completedWeeks.has(candidate.getTime())) { targetDate = new Date(candidate); break; }
        }
      }
      const completion = item.completions.find((c) => c.date.getTime() === targetDate.getTime()) ?? null;
      return {
        id: item.id,
        period: item.period,
        dueWeekday: item.dueWeekday,
        completionDate: targetDate.toISOString().slice(0, 10),
        title: item.title,
        order: item.order,
        isActive: item.isActive,
        completion: completion
          ? {
              completedAt: completion.completedAt.toISOString(),
              completedByName: completion.completedBy?.name ?? null,
              canUncheck: completion.completedById === (session.user as { id: string }).id,
            }
          : null,
      };
    }),
  });
}
