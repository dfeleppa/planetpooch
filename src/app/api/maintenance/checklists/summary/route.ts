import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/maintenance/checklists/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Per-day completion counts for the date scroller dots. Totals use the
 * current active item counts — good enough as an at-a-glance cue.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
  }

  const [totals, completions] = await Promise.all([
    prisma.dailyChecklistItem.groupBy({
      by: ["period"],
      where: { isActive: true },
      _count: { _all: true },
    }),
    prisma.dailyChecklistCompletion.findMany({
      where: { date: { gte: new Date(start), lte: new Date(end) } },
      include: { item: { select: { period: true } } },
    }),
  ]);

  const amTotal = totals.find((t) => t.period === "AM")?._count._all ?? 0;
  const pmTotal = totals.find((t) => t.period === "PM")?._count._all ?? 0;

  const days: Record<string, { amDone: number; pmDone: number }> = {};
  for (const c of completions) {
    const key = c.date.toISOString().slice(0, 10);
    days[key] ??= { amDone: 0, pmDone: 0 };
    if (c.item.period === "AM") days[key].amDone += 1;
    else days[key].pmDone += 1;
  }

  return NextResponse.json({ amTotal, pmTotal, days });
}
