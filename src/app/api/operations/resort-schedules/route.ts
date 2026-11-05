import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canManageResortSchedules, preferredScheduleWeek, savedScheduleInput, scheduleWeekStart } from "@/lib/schedule-storage";

export const dynamic = "force-dynamic";

async function savedWeeks() {
  const weeks = await prisma.resortStaffSchedule.findMany({ select: { weekStart: true, title: true, revision: true, updatedAt: true }, orderBy: { weekStart: "desc" } });
  return weeks.map(week => ({ ...week, updatedAt: week.updatedAt.toISOString() }));
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageResortSchedules(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const requested = req.nextUrl.searchParams.get("week");
  if (requested && !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return NextResponse.json({ error: "Invalid week." }, { status: 400 });
  try {
    const weeks = await savedWeeks();
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const weekStart = requested ?? preferredScheduleWeek(weeks, today);
    const saved = weekStart ? await prisma.resortStaffSchedule.findUnique({ where: { weekStart }, select: { weekStart: true, title: true, revision: true, updatedAt: true, schedule: true } }) : null;
    if (requested && !saved) return NextResponse.json({ error: "That week has not been saved." }, { status: 404 });
    return NextResponse.json({ weeks, saved }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Load Resort staffing schedules failed", error);
    return NextResponse.json({ error: "Saved schedules could not be loaded. Please try again." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canManageResortSchedules(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const raw = await req.text();
  if (raw.length > 1024 * 1024) return NextResponse.json({ error: "The extracted schedule is too large." }, { status: 413 });
  let input: ReturnType<typeof savedScheduleInput.parse>;
  let weekStart: string;
  try {
    input = savedScheduleInput.parse(JSON.parse(raw));
    weekStart = scheduleWeekStart(input.schedule);
  } catch (error) {
    const message = error instanceof SyntaxError ? "Invalid schedule data." : error instanceof Error && !(error instanceof Prisma.PrismaClientKnownRequestError) && error.name !== "ZodError" ? error.message : "Check the schedule dates, employee names, and shift times.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
  try {
    const data = { title: input.schedule.title, schedule: input.schedule as Prisma.InputJsonValue, updatedById: session.user.id };
    const saved = await prisma.$transaction(async tx => {
      if (input.expectedRevision === null) return tx.resortStaffSchedule.create({ data: { ...data, weekStart } });
      const updated = await tx.resortStaffSchedule.updateMany({ where: { weekStart, revision: input.expectedRevision }, data: { ...data, revision: { increment: 1 } } });
      if (!updated.count) return null;
      return tx.resortStaffSchedule.findUnique({ where: { weekStart } });
    });
    if (!saved) return NextResponse.json({ error: "This week was changed by another user. Reload the saved week before replacing it." }, { status: 409 });
    return NextResponse.json({ saved, weeks: await savedWeeks() }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "This week has already been saved. Reload the saved week before replacing it." }, { status: 409 });
    console.error("Save Resort staffing schedule failed", error);
    return NextResponse.json({ error: "The schedule was not saved. Please try again." }, { status: 500 });
  }
}
