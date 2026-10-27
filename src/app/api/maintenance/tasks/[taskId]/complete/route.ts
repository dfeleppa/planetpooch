import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { isFrontDesk } from "@/lib/front-desk-access";

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

  if (isFrontDesk(session.user)) {
    const allowed = await prisma.maintenanceTask.findUnique({ where: { id: taskId, company: "RESORT" } });
    if (!allowed) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!Array.isArray(usages) || usages.some((u: { inventoryItemId?: unknown; quantityUsed?: unknown }) =>
      typeof u?.inventoryItemId !== "string" || typeof u.quantityUsed !== "number" || !Number.isFinite(u.quantityUsed) || u.quantityUsed <= 0)) {
      return NextResponse.json({ error: "Invalid inventory usage" }, { status: 400 });
    }
    const ids = [...new Set(usages.map((u: { inventoryItemId: string }) => u.inventoryItemId))];
    const count = await prisma.inventoryItem.count({ where: { id: { in: ids }, company: "RESORT" } });
    if (count !== ids.length) return NextResponse.json({ error: "Inventory must belong to Pet Resort" }, { status: 403 });
  }

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
