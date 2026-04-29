import { RecurrenceInterval } from "@prisma/client";
import { prisma } from "./prisma";

export function calculateNextDueDate(
  fromDate: Date,
  interval: RecurrenceInterval,
  customIntervalDays?: number | null
): Date {
  const next = new Date(fromDate);
  switch (interval) {
    case "WEEKLY":
      next.setDate(next.getDate() + 7);
      break;
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3);
      break;
    case "YEARLY":
      next.setFullYear(next.getFullYear() + 1);
      break;
    case "CUSTOM":
      next.setDate(next.getDate() + (customIntervalDays ?? 1));
      break;
  }
  return next;
}

export async function generateMaintenanceTask(scheduleId: string) {
  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { id: scheduleId },
  });
  if (!schedule || !schedule.isActive) return null;

  const task = await prisma.$transaction(async (tx) => {
    const newTask = await tx.maintenanceTask.create({
      data: {
        scheduleId,
        title: schedule.title,
        description: schedule.description,
        dueDate: schedule.nextDueDate,
        status: "PENDING",
        company: schedule.company,
      },
    });

    const nextDue = calculateNextDueDate(
      schedule.nextDueDate,
      schedule.recurrenceInterval,
      schedule.customIntervalDays
    );

    await tx.maintenanceSchedule.update({
      where: { id: scheduleId },
      data: { nextDueDate: nextDue },
    });

    return newTask;
  });

  return task;
}

export interface SufficiencyResult {
  sufficient: boolean;
  items: {
    inventoryItemId: string;
    name: string;
    unit: string;
    required: number;
    available: number;
    shortfall: number;
  }[];
}

export async function checkInventorySufficiency(scheduleId: string): Promise<SufficiencyResult> {
  const requirements = await prisma.maintenanceInventoryRequirement.findMany({
    where: { scheduleId },
    include: { inventoryItem: true },
  });

  const items = requirements.map((req) => {
    const shortfall = Math.max(0, req.quantityRequired - req.inventoryItem.currentQuantity);
    return {
      inventoryItemId: req.inventoryItemId,
      name: req.inventoryItem.name,
      unit: req.inventoryItem.unit,
      required: req.quantityRequired,
      available: req.inventoryItem.currentQuantity,
      shortfall,
    };
  });

  return {
    sufficient: items.every((i) => i.shortfall === 0),
    items,
  };
}

export function formatRecurrenceInterval(interval: RecurrenceInterval, customDays?: number | null) {
  switch (interval) {
    case "WEEKLY":
      return "Weekly";
    case "MONTHLY":
      return "Monthly";
    case "QUARTERLY":
      return "Quarterly";
    case "YEARLY":
      return "Yearly";
    case "CUSTOM":
      return `Every ${customDays ?? "?"} days`;
  }
}
