import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canAccessChecklist } from "@/lib/checklist-access";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/maintenance/checklists/summary?start=YYYY-MM-DD&end=YYYY-MM-DD
 * Per-day completion counts for the date scroller dots. Totals use the
 * current active item counts — good enough as an at-a-glance cue.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const department = req.nextUrl.searchParams.get("department") ?? "BOARDING";
  if (!["BOARDING", "GROOMING", "FRONT_DESK", "MANAGEMENT"].includes(department)) {
    return NextResponse.json({ error: "Invalid checklist department" }, { status: 400 });
  }

  if (!canAccessChecklist(session.user, department)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const start = req.nextUrl.searchParams.get("start");
  const end = req.nextUrl.searchParams.get("end");
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json({ error: "start and end must be YYYY-MM-DD" }, { status: 400 });
  }

  const [totals, completions] = await Promise.all([
    prisma.dailyChecklistItem.groupBy({
      by: ["period", "dualCheck"],
      where: { department, isActive: true },
      _count: { _all: true },
    }),
    prisma.dailyChecklistCompletion.findMany({
      where: { item: { department }, date: { gte: new Date(start), lte: new Date(end) } },
      include: { item: { select: { period: true, dualCheck: true } } },
    }),
  ]);

  const dailyTotal = totals.filter((t) => t.period === "DAILY").reduce((sum, t) => sum + t._count._all * (t.dualCheck ? 2 : 1), 0);

  const days: Record<string, { dailyDone: number }> = {};
  for (const c of completions) {
    const key = c.date.toISOString().slice(0, 10);
    days[key] ??= { dailyDone: 0 };
    if (c.item.period === "DAILY" && (c.item.dualCheck ? c.slot === "AM" || c.slot === "PM" : !c.slot || c.slot === "SINGLE")) days[key].dailyDone += 1;
  }

  return NextResponse.json({ dailyTotal, days });
}
