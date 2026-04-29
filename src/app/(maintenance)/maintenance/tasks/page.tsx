import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { CompanyFilterTabs, resolveCompanyParam } from "@/components/ui/CompanyFilterTabs";
import { Company } from "@prisma/client";
import Link from "next/link";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  OVERDUE: "Overdue",
  SKIPPED: "Skipped",
};

const STATUS_VARIANT: Record<string, "default" | "info" | "success" | "danger" | "warning"> = {
  PENDING: "default",
  IN_PROGRESS: "info",
  COMPLETED: "success",
  OVERDUE: "danger",
  SKIPPED: "warning",
};

function defaultCompany(userCompany: Company | null | undefined): Company {
  return userCompany === "RESORT" ? "RESORT" : "GROOMING";
}

export default async function MaintenanceTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; company?: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const user = session?.user as { company?: Company | null } | undefined;
  const { status, company: companyParam } = await searchParams;
  const resolved = resolveCompanyParam(companyParam, defaultCompany(user?.company));
  const active: Company = resolved === "ALL" ? defaultCompany(user?.company) : resolved;

  const tasks = await prisma.maintenanceTask.findMany({
    where: {
      ...(status && { status: status as never }),
      company: active,
    },
    orderBy: { dueDate: "asc" },
    include: {
      schedule: { select: { id: true, title: true } },
      assignedTo: { select: { id: true, name: true } },
    },
  });

  const statusHref = (s: string) => {
    const params = new URLSearchParams();
    if (s) params.set("status", s);
    params.set("company", active);
    return `/maintenance/tasks?${params.toString()}`;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Tasks</h1>
          <p className="text-gray-500 mt-1">All task occurrences from maintenance schedules</p>
        </div>
        <div className="flex gap-2">
          {["", "PENDING", "IN_PROGRESS", "COMPLETED", "OVERDUE"].map((s) => (
            <Link
              key={s}
              href={statusHref(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                (s === "" && !status) || s === status
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {s === "" ? "All" : STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
      </div>

      <div className="mb-4">
        <CompanyFilterTabs
          basePath="/maintenance/tasks"
          active={active}
          extraParams={{ status }}
          hideAll
        />
      </div>

      {tasks.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState icon="🔧" title="No tasks found" description="Tasks are generated from maintenance schedules." />
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <TableHeader>Task</TableHeader>
              <TableHeader>Schedule</TableHeader>
              <TableHeader>Due Date</TableHeader>
              <TableHeader>Assigned To</TableHeader>
              <TableHeader>Status</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {tasks.map((task) => (
              <TableRow key={task.id}>
                <TableCell>
                  <Link href={`/maintenance/tasks/${task.id}`} className="font-medium text-blue-600 hover:underline">
                    {task.title}
                  </Link>
                </TableCell>
                <TableCell>
                  {task.schedule ? (
                    <Link href={`/maintenance/schedules/${task.schedule.id}`} className="text-gray-600 hover:text-blue-600">
                      {task.schedule.title}
                    </Link>
                  ) : (
                    <span className="text-gray-400">Ad-hoc</span>
                  )}
                </TableCell>
                <TableCell className="text-gray-600">
                  {new Date(task.dueDate).toLocaleDateString()}
                </TableCell>
                <TableCell className="text-gray-600">
                  {task.assignedTo?.name ?? <span className="text-gray-400">Unassigned</span>}
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[task.status] ?? "default"}>
                    {STATUS_LABELS[task.status] ?? task.status}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
