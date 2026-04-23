import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;

  const task = await prisma.maintenanceTask.findUnique({
    where: { id: taskId },
    include: {
      schedule: {
        include: {
          requirements: { include: { inventoryItem: true } },
        },
      },
      assignedTo: { select: { id: true, name: true, email: true } },
      completedBy: { select: { id: true, name: true } },
      usages: { include: { inventoryItem: true } },
    },
  });

  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(task);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const body = await req.json();
  const { status, assignedToId, notes } = body;

  const task = await prisma.maintenanceTask.update({
    where: { id: taskId },
    data: {
      ...(status !== undefined && { status }),
      ...(assignedToId !== undefined && { assignedToId }),
      ...(notes !== undefined && { notes }),
    },
  });

  return NextResponse.json(task);
}
