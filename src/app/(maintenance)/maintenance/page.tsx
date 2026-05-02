import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CompanyFilterTabs, resolveCompanyParam } from "@/components/ui/CompanyFilterTabs";
import { Company } from "@prisma/client";
import Link from "next/link";

function defaultCompany(userCompany: Company | null | undefined): Company {
  return userCompany === "RESORT" ? "RESORT" : "GROOMING";
}

export default async function MaintenanceDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const user = session?.user as { company?: Company | null } | undefined;

  const { company: companyParam } = await searchParams;
  const resolved = resolveCompanyParam(companyParam, defaultCompany(user?.company));
  const active: Company = resolved === "ALL" ? defaultCompany(user?.company) : resolved;

  const now = new Date();
  const sevenDaysFromNow = new Date(now);
  sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);

  const [overdueTasks, upcomingTasks, lowInventory] = await Promise.all([
    prisma.maintenanceTask.findMany({
      where: { company: active, dueDate: { lt: now }, status: { in: ["PENDING", "IN_PROGRESS"] } },
      orderBy: { dueDate: "asc" },
      include: {
        schedule: { select: { id: true, title: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      take: 10,
    }),
    prisma.maintenanceTask.findMany({
      where: {
        company: active,
        dueDate: { gte: now, lte: sevenDaysFromNow },
        status: { in: ["PENDING", "IN_PROGRESS"] },
      },
      orderBy: { dueDate: "asc" },
      include: {
        schedule: { select: { id: true, title: true } },
        assignedTo: { select: { id: true, name: true } },
      },
      take: 10,
    }),
    prisma.inventoryItem.findMany({ where: { company: active }, orderBy: { name: "asc" } })
      .then((items) => items.filter((i) => i.minimumThreshold > 0 && i.currentQuantity <= i.minimumThreshold)),
  ]);

  const totalSchedules = await prisma.maintenanceSchedule.count({ where: { company: active, isActive: true } });
  const totalInventoryItems = await prisma.inventoryItem.count({ where: { company: active } });

  const qs = `?company=${active}`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance</h1>
          <p className="text-gray-500 mt-1">Facility maintenance schedules and inventory</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/maintenance/schedules${qs}`} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View Schedules
          </Link>
          <Link href={`/maintenance/inventory${qs}`} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View Inventory
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <CompanyFilterTabs basePath="/maintenance" active={active} hideAll />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{totalSchedules}</p>
            <p className="text-sm text-gray-500">Active Schedules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-red-600">{overdueTasks.length}</p>
            <p className="text-sm text-gray-500">Overdue Tasks</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-yellow-600">{upcomingTasks.length}</p>
            <p className="text-sm text-gray-500">Due This Week</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-orange-600">{lowInventory.length}</p>
            <p className="text-sm text-gray-500">Low Inventory Items</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Overdue Tasks</h2>
              <Link href={`/maintenance/tasks?status=PENDING&company=${active}`} className="text-xs text-blue-600 hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {overdueTasks.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No overdue tasks</p>
            ) : (
              <div className="space-y-2">
                {overdueTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/maintenance/tasks/${task.id}`}
                    className="block p-3 rounded-lg border border-red-100 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                        {task.assignedTo && (
                          <p className="text-xs text-gray-500">{task.assignedTo.name}</p>
                        )}
                      </div>
                      <Badge variant="danger">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Upcoming This Week</h2>
              <Link href={`/maintenance/tasks${qs}`} className="text-xs text-blue-600 hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {upcomingTasks.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">No tasks due this week</p>
            ) : (
              <div className="space-y-2">
                {upcomingTasks.map((task) => (
                  <Link
                    key={task.id}
                    href={`/maintenance/tasks/${task.id}`}
                    className="block p-3 rounded-lg border border-yellow-100 bg-yellow-50 hover:bg-yellow-100 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{task.title}</p>
                        {task.assignedTo && (
                          <p className="text-xs text-gray-500">{task.assignedTo.name}</p>
                        )}
                      </div>
                      <Badge variant="warning">
                        {new Date(task.dueDate).toLocaleDateString()}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">Low Inventory Alerts</h2>
              <Link href={`/maintenance/inventory${qs}`} className="text-xs text-blue-600 hover:underline">
                View all
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {lowInventory.length === 0 ? (
              <p className="text-sm text-gray-500 py-4 text-center">All inventory levels are sufficient</p>
            ) : (
              <div className="space-y-2">
                {lowInventory.map((item) => (
                  <Link
                    key={item.id}
                    href={`/maintenance/inventory/${item.id}`}
                    className="block p-3 rounded-lg border border-orange-100 bg-orange-50 hover:bg-orange-100 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-gray-900">{item.name}</p>
                      <Badge variant="danger">
                        {item.currentQuantity} / {item.minimumThreshold} {item.unit}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-base font-semibold text-gray-900">Quick Links</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              <Link
                href={`/maintenance/schedules/new${qs}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">+ New Schedule</p>
                <p className="text-xs text-gray-500">Create a recurring maintenance schedule</p>
              </Link>
              <Link
                href={`/maintenance/inventory/new${qs}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">+ Add Inventory Item</p>
                <p className="text-xs text-gray-500">Track a new supply or material</p>
              </Link>
              <Link
                href={`/maintenance/tasks${qs}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">All Maintenance Tasks</p>
                <p className="text-xs text-gray-500">View and filter task history</p>
              </Link>
              <Link
                href={`/maintenance/inventory${qs}`}
                className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">Inventory ({totalInventoryItems} items)</p>
                <p className="text-xs text-gray-500">Manage stock levels and adjustments</p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
