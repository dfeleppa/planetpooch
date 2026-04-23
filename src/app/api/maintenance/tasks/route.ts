import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const assignedToId = searchParams.get("assignedToId");

  const tasks = await prisma.maintenanceTask.findMany({
    where: {
      ...(status && { status: status as never }),
      ...(assignedToId && { assignedToId }),
    },
    orderBy: { dueDate: "asc" },
    include: {
      schedule: { select: { id: true, title: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(tasks);
}
