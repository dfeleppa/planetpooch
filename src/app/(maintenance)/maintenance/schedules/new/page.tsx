import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { NewScheduleForm } from "./NewScheduleForm";

export default async function NewSchedulePage() {
  await requireAdmin();

  const inventoryItems = await prisma.inventoryItem.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, unit: true },
  });

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">New Maintenance Schedule</h1>
        <p className="text-gray-500 mt-1">Set up a recurring maintenance task with inventory requirements</p>
      </div>
      <NewScheduleForm inventoryItems={inventoryItems} />
    </div>
  );
}
