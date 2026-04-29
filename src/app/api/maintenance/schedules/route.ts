import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { calculateNextDueDate } from "@/lib/maintenance";
import { Company, RecurrenceInterval } from "@prisma/client";

const COMPANIES: Company[] = ["RESORT", "GROOMING"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const companyParam = req.nextUrl.searchParams.get("company");
  const company = COMPANIES.includes(companyParam as Company)
    ? (companyParam as Company)
    : null;

  const schedules = await prisma.maintenanceSchedule.findMany({
    where: company ? { company } : {},
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
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, recurrenceInterval, customIntervalDays, startDate, company } = body;

  if (!title || !recurrenceInterval || !startDate) {
    return NextResponse.json({ error: "title, recurrenceInterval, and startDate are required" }, { status: 400 });
  }

  if (!COMPANIES.includes(company)) {
    return NextResponse.json({ error: "company must be RESORT or GROOMING" }, { status: 400 });
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
      company,
    },
  });

  return NextResponse.json(schedule, { status: 201 });
}
