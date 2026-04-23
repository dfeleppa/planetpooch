import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { checkInventorySufficiency } from "@/lib/maintenance";

function isManagerOrAbove(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "ADMIN";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { scheduleId } = await params;

  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      requirements: { include: { inventoryItem: true } },
      tasks: { orderBy: { dueDate: "desc" }, take: 20 },
    },
  });

  if (!schedule) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sufficiency = await checkInventorySufficiency(scheduleId);

  return NextResponse.json({ ...schedule, sufficiency });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scheduleId } = await params;
  const body = await req.json();
  const { title, description, isActive, requirements } = body;

  const schedule = await prisma.$transaction(async (tx) => {
    const updated = await tx.maintenanceSchedule.update({
      where: { id: scheduleId },
      data: {
        ...(title !== undefined && { title }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
      },
    });

    if (requirements !== undefined) {
      await tx.maintenanceInventoryRequirement.deleteMany({ where: { scheduleId } });
      if (requirements.length > 0) {
        await tx.maintenanceInventoryRequirement.createMany({
          data: requirements.map((r: { inventoryItemId: string; quantityRequired: number }) => ({
            scheduleId,
            inventoryItemId: r.inventoryItemId,
            quantityRequired: r.quantityRequired,
          })),
        });
      }
    }

    return updated;
  });

  return NextResponse.json(schedule);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ scheduleId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scheduleId } = await params;
  await prisma.maintenanceSchedule.delete({ where: { id: scheduleId } });
  return NextResponse.json({ success: true });
}
