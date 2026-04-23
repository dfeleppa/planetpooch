import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { calculateNextDueDate } from "@/lib/maintenance";
import { RecurrenceInterval } from "@prisma/client";

function isManagerOrAbove(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "ADMIN";
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedules = await prisma.maintenanceSchedule.findMany({
    orderBy: { nextDueDate: "asc" },
    include: {
      requirements: {
        include: { inventoryItem: true },
      },
      _count: { select: { tasks: true } },
    },
  });

  return NextResponse.json(schedules);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, recurrenceInterval, customIntervalDays, startDate } = body;

  if (!title || !recurrenceInterval || !startDate) {
    return NextResponse.json({ error: "title, recurrenceInterval, and startDate are required" }, { status: 400 });
  }

  const start = new Date(startDate);
  const nextDueDate = calculateNextDueDate(start, recurrenceInterval as RecurrenceInterval, customIntervalDays);

  const schedule = await prisma.maintenanceSchedule.create({
    data: {
      title,
      description: description ?? "",
      recurrenceInterval,
      customIntervalDays: customIntervalDays ?? null,
      startDate: start,
      nextDueDate,
      createdById: session.user.id,
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}
