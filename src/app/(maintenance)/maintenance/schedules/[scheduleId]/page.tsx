import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatRecurrenceInterval } from "@/lib/maintenance";
import { ScheduleActions } from "./ScheduleActions";
import Link from "next/link";

export default async function ScheduleDetailPage({
  params,
}: {
  params: Promise<{ scheduleId: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const isAdmin = (session?.user as { role?: string })?.role === "ADMIN";

  const { scheduleId } = await params;

  const schedule = await prisma.maintenanceSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      requirements: { include: { inventoryItem: true } },
      tasks: { orderBy: { dueDate: "desc" }, take: 20, include: { assignedTo: { select: { name: true } } } },
      createdBy: { select: { name: true } },
    },
  });

  if (!schedule) notFound();

  const inventoryItems = isAdmin
    ? await prisma.inventoryItem.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, unit: true } })
    : [];

  const now = new Date();
  const isOverdue = schedule.nextDueDate < now;
  const daysUntilDue = Math.ceil((schedule.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  const allSufficient = schedule.requirements.every(
    (r) => r.inventoryItem.currentQuantity >= r.quantityRequired
  );

  return (
    <div>
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4">
        <Link href="/maintenance/schedules" className="hover:text-blue-600">Schedules</Link>
        <span>/</span>
        <span className="text-gray-900">{schedule.title}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{schedule.title}</h1>
            {!schedule.isActive && <Badge variant="default">Inactive</Badge>}
          </div>
          {schedule.description && (
            <p className="text-gray-500 mt-1">{schedule.description}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">Created by {schedule.createdBy?.name ?? "(removed)"}</p>
        </div>
        {isAdmin && (
          <ScheduleActions
            scheduleId={scheduleId}
            isActive={schedule.isActive}
            inventoryItems={inventoryItems}
            currentRequirements={schedule.requirements.map((r) => ({
              inventoryItemId: r.inventoryItemId,
              quantityRequired: r.quantityRequired,
            }))}
          />
        )}
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 mb-1">Recurrence</p>
            <p className="text-sm font-semibold text-gray-900">
              {formatRecurrenceInterval(schedule.recurrenceInterval, schedule.customIntervalDays)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 mb-1">Next Due Date</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">
                {new Date(schedule.nextDueDate).toLocaleDateString()}
              </p>
              <Badge variant={isOverdue ? "danger" : daysUntilDue <= 7 ? "warning" : "success"}>
                {isOverdue ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? "Today" : `${daysUntilDue}d`}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 mb-1">Inventory</p>
            {schedule.requirements.length === 0 ? (
              <p className="text-sm text-gray-400">No requirements</p>
            ) : (
              <Badge variant={allSufficient ? "success" : "danger"}>
                {allSufficient ? "All stock sufficient" : "Low stock"}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Inventory Requirements</h2>
          </CardHeader>
          <CardContent className="pt-0">
            {schedule.requirements.length === 0 ? (
              <p className="text-sm text-gray-500">No inventory requirements set for this schedule.</p>
            ) : (
              <div className="space-y-2">
                {schedule.requirements.map((req) => {
                  const sufficient = req.inventoryItem.currentQuantity >= req.quantityRequired;
                  return (
                    <div key={req.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div>
                        <p className="text-sm font-medium text-gray-900">{req.inventoryItem.name}</p>
                        <p className="text-xs text-gray-500">
                          Required: {req.quantityRequired} {req.inventoryItem.unit}
                        </p>
                      </div>
                      <div className="text-right">
                        <Badge variant={sufficient ? "success" : "danger"}>
                          {req.inventoryItem.currentQuantity} on hand
                        </Badge>
                        {!sufficient && (
                          <p className="text-xs text-red-600 mt-1">
                            Need {req.quantityRequired - req.inventoryItem.currentQuantity} more
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Task History</h2>
          </CardHeader>
          <CardContent className="pt-0">
            {schedule.tasks.length === 0 ? (
              <p className="text-sm text-gray-500">No tasks generated yet.</p>
            ) : (
              <div className="space-y-2">
                {schedule.tasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/maintenance/tasks/${task.id}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">{task.title}</p>
                      {task.assignedTo && <p className="text-xs text-gray-500">{task.assignedTo.name}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          task.status === "COMPLETED" ? "success" :
                          task.status === "OVERDUE" ? "danger" :
                          task.status === "IN_PROGRESS" ? "info" : "default"
                        }
                      >
                        {task.status}
                      </Badge>
                      <span className="text-xs text-gray-400">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
