import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canManageMaintenance, canUpdateMaintenanceTask, maintenanceCompanyWhere } from "@/lib/maintenance-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;

  const task = await prisma.maintenanceTask.findUnique({
    where: { id: taskId, ...maintenanceCompanyWhere(session.user) },
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
  const existing = await prisma.maintenanceTask.findUnique({ where: { id: taskId, ...maintenanceCompanyWhere(session.user) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canUpdateMaintenanceTask(session.user, existing)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json();
  const { status, assignedToId, notes } = body;
  if ((status !== undefined || assignedToId !== undefined) && !canManageMaintenance(session.user)) {
    return NextResponse.json({ error: "Only managers can change task status or assignment" }, { status: 403 });
  }
  // Completed tasks stay final; otherwise completion could be replayed to consume stock again.
  if (status !== undefined && (status === "COMPLETED" || existing.status === "COMPLETED")) {
    return NextResponse.json({ error: "Use task completion to complete a task; completed tasks cannot be reopened" }, { status: 409 });
  }
  if (assignedToId != null) {
    const assignee = await prisma.user.findFirst({ where: { id: assignedToId, terminatedAt: null,
      company: { in: [existing.company, "CORPORATE"] } }, select: { id: true } });
    if (!assignee) return NextResponse.json({ error: "Invalid assignee" }, { status: 400 });
  }

  const task = await prisma.maintenanceTask.update({
    where: { id: taskId, ...maintenanceCompanyWhere(session.user), status: existing.status },
    data: {
      ...(status !== undefined && { status }),
      ...(assignedToId !== undefined && { assignedToId }),
      ...(notes !== undefined && { notes }),
    },
  });

  return NextResponse.json(task);
}
