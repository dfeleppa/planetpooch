import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const body = await req.json();
  // usages: [{ inventoryItemId: string, quantityUsed: number }]
  const { usages = [], notes } = body;

  const task = await prisma.$transaction(async (tx) => {
    const completed = await tx.maintenanceTask.update({
      where: { id: taskId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        completedById: session.user.id,
        ...(notes !== undefined && { notes }),
      },
    });

    for (const usage of usages as { inventoryItemId: string; quantityUsed: number }[]) {
      await tx.inventoryUsage.create({
        data: {
          maintenanceTaskId: taskId,
          inventoryItemId: usage.inventoryItemId,
          quantityUsed: usage.quantityUsed,
        },
      });

      await tx.inventoryItem.update({
        where: { id: usage.inventoryItemId },
        data: {
          currentQuantity: { decrement: usage.quantityUsed },
        },
      });
    }

    return completed;
  });

  return NextResponse.json(task);
}
