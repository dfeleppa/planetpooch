import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TaskCompleteForm } from "./TaskCompleteForm";
import Link from "next/link";

const STATUS_VARIANT: Record<string, "default" | "info" | "success" | "danger" | "warning"> = {
  PENDING: "default",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  OVERDUE: "danger",
  SKIPPED: "warning",
};

export default async function MaintenanceTaskDetailPage({
  params,
}: {
  params: Promise<{ taskId: string }>;
}) {
  await requireAuth();
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
      usages: { include: { inventoryItem: { select: { id: true, name: true, unit: true } } } },
    },
  });

  if (!task) notFound();

  const isComplete = task.status === "COMPLETED";

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/maintenance/tasks" className="hover:text-blue-600">Tasks</Link>
        <span>/</span>
        <span className="text-gray-900">{task.title}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-gray-900">{task.title}</h1>
            <Badge variant={STATUS_VARIANT[task.status] ?? "default"}>{task.status}</Badge>
          </div>
          {task.schedule && (
            <p className="text-sm text-gray-500">
              From schedule:{" "}
              <Link href={`/maintenance/schedules/${task.schedule.id}`} className="text-blue-600 hover:underline">
                {task.schedule.title}
              </Link>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 mb-1">Due Date</p>
            <p className="text-sm font-semibold text-gray-900">{new Date(task.dueDate).toLocaleDateString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 mb-1">Assigned To</p>
            <p className="text-sm font-semibold text-gray-900">{task.assignedTo?.name ?? "Unassigned"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 mb-1">Completed By</p>
            {task.completedBy ? (
              <p className="text-sm font-semibold text-gray-900">{task.completedBy.name}</p>
            ) : (
              <p className="text-sm text-gray-400">Not yet completed</p>
            )}
          </CardContent>
        </Card>
      </div>

      {task.description && (
        <Card className="mb-6">
          <CardContent>
            <p className="text-sm text-gray-700">{task.description}</p>
          </CardContent>
        </Card>
      )}

      {!isComplete && task.schedule?.requirements && task.schedule.requirements.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Required Inventory</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {task.schedule.requirements.map((req) => {
                const sufficient = req.inventoryItem.currentQuantity >= req.quantityRequired;
                return (
                  <div key={req.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900">{req.inventoryItem.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Need: {req.quantityRequired} {req.inventoryItem.unit}</span>
                      <Badge variant={sufficient ? "success" : "danger"}>
                        {req.inventoryItem.currentQuantity} on hand
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {isComplete && task.usages.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Inventory Used</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {task.usages.map((u) => (
                <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-900">{u.inventoryItem.name}</p>
                  <span className="text-sm text-gray-600">{u.quantityUsed} {u.inventoryItem.unit}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!isComplete && (
        <TaskCompleteForm
          taskId={taskId}
          requirements={
            task.schedule?.requirements.map((r) => ({
              inventoryItemId: r.inventoryItemId,
              name: r.inventoryItem.name,
              unit: r.inventoryItem.unit,
              defaultQuantity: r.quantityRequired,
            })) ?? []
          }
        />
      )}

      {task.notes && (
        <Card className="mt-6">
          <CardHeader><h2 className="text-base font-semibold text-gray-900">Notes</h2></CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-gray-700">{task.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
