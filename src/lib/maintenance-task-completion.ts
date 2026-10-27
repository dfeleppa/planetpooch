import type { PrismaClient } from "@prisma/client";
import { canUpdateMaintenanceTask, maintenanceCompanyWhere, type MaintenanceUser } from "./maintenance-access";

export class MaintenanceRequestError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Usage = { inventoryItemId: string; quantityUsed: number };
export function completionPayload(body: unknown): { usages: Usage[]; notes?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new MaintenanceRequestError("Invalid completion payload", 400);
  const { usages = [], notes } = body as Record<string, unknown>;
  if (!Array.isArray(usages) || usages.length > 100 ||
    (notes !== undefined && (typeof notes !== "string" || notes.length > 5000))) {
    throw new MaintenanceRequestError("Invalid usages or notes", 400);
  }
  const ids = new Set<string>();
  const rows: Usage[] = usages.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new MaintenanceRequestError("Invalid usage", 400);
    const { inventoryItemId, quantityUsed } = entry as Record<string, unknown>;
    if (typeof inventoryItemId !== "string" || !inventoryItemId || ids.has(inventoryItemId) ||
      typeof quantityUsed !== "number" || !Number.isSafeInteger(quantityUsed) || quantityUsed < 0 || quantityUsed > 2_147_483_647) {
      throw new MaintenanceRequestError("Each inventory item needs a unique ID and a nonnegative whole quantity", 400);
    }
    ids.add(inventoryItemId);
    return { inventoryItemId, quantityUsed };
  });
  return { usages: rows, ...(typeof notes === "string" ? { notes } : {}) };
}

export async function completeMaintenanceTask(db: Pick<PrismaClient, "$transaction">, user: MaintenanceUser & { id: string }, taskId: string, body: unknown) {
  const { usages, notes } = completionPayload(body);
  return db.$transaction(async (tx) => {
    const task = await tx.maintenanceTask.findUnique({ where: { id: taskId, ...maintenanceCompanyWhere(user) } });
    if (!task) throw new MaintenanceRequestError("Task not found", 404);
    if (!canUpdateMaintenanceTask(user, task)) throw new MaintenanceRequestError("Forbidden", 403);
    if (task.status === "COMPLETED") return task;

    // Only the request that claims this transition may consume stock. A
    // concurrent request waits on this row and then sees COMPLETED.
    const claimed = await tx.maintenanceTask.updateMany({
      where: { id: taskId, ...maintenanceCompanyWhere(user), status: { not: "COMPLETED" }, assignedToId: task.assignedToId },
      data: { status: "COMPLETED", completedAt: new Date(), completedById: user.id, ...(notes !== undefined && { notes }) },
    });
    if (claimed.count !== 1) {
      const current = await tx.maintenanceTask.findUnique({ where: { id: taskId, ...maintenanceCompanyWhere(user) } });
      if (current?.status === "COMPLETED" && canUpdateMaintenanceTask(user, current)) return current;
      throw new MaintenanceRequestError("Task changed; refresh and try again", 409);
    }
    for (const usage of usages) {
      const item = await tx.inventoryItem.findUnique({ where: { id: usage.inventoryItemId, company: task.company } });
      if (!item) throw new MaintenanceRequestError("Inventory item does not belong to this task's company", 400);
      if (usage.quantityUsed === 0) continue;
      const consumed = await tx.inventoryItem.updateMany({
        where: { id: item.id, company: task.company, currentQuantity: { gte: usage.quantityUsed } },
        data: { currentQuantity: { decrement: usage.quantityUsed } },
      });
      if (consumed.count !== 1) throw new MaintenanceRequestError("Insufficient inventory; refresh stock counts", 409);
      await tx.inventoryUsage.create({ data: { maintenanceTaskId: taskId, ...usage } });
    }
    // Errors roll back the claim and every stock/usage write.
    return tx.maintenanceTask.findUniqueOrThrow({ where: { id: taskId } });
  });
}
