import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { reconcilePostPayoutChanges } from "@/lib/mobile-grooming-post-payout";
import { prisma } from "@/lib/prisma";

async function authorized() {
  const session = await getSession();
  return Boolean(session?.user && isSuperAdmin((session.user as { role?: string }).role));
}

function weekDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 6
    ? null : date;
}

const paidWeekFilter = {
  OR: [{ mobileGroomingPayLocks: { some: {} } }, { mobileGroomingCloseout: { isNot: null } }],
};

export async function GET() {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const weeks = await prisma.financePayrollWeek.findMany({
    where: {
      business: "mobile-grooming",
      ...paidWeekFilter,
    },
    select: { weekStart: true, weekEnd: true },
    orderBy: { weekStart: "desc" },
  });
  return NextResponse.json({ weeks: weeks.map((week) => ({
    weekStart: week.weekStart.toISOString().slice(0, 10),
    weekEnd: week.weekEnd.toISOString().slice(0, 10),
  })) });
}

export async function POST(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const weekStart = weekDate(body.weekStart);
  if (!weekStart) return NextResponse.json({ error: "Select a valid Saturday pay week." }, { status: 400 });
  const week = await prisma.financePayrollWeek.findFirst({
    where: { business: "mobile-grooming", weekStart, ...paidWeekFilter },
    select: { id: true, weekStart: true, mobileGroomingEntries: true },
  });
  if (!week) return NextResponse.json({ error: "No locked or closed employee pay exists for this week." }, { status: 404 });
  const checkedAt = new Date();
  const result = await prisma.$transaction((tx) => reconcilePostPayoutChanges(
    tx, week.id, week.weekStart, week.mobileGroomingEntries, checkedAt
  ));
  return NextResponse.json({
    weekStart: week.weekStart.toISOString().slice(0, 10),
    ...result,
    checkedAt: checkedAt.toISOString(),
  });
}
