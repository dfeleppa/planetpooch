import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CompanyFilterTabs, resolveCompanyParam } from "@/components/ui/CompanyFilterTabs";
import { formatRecurrenceInterval } from "@/lib/maintenance";
import { Company } from "@prisma/client";
import Link from "next/link";

function defaultCompany(userCompany: Company | null | undefined): Company {
  return userCompany === "RESORT" ? "RESORT" : "GROOMING";
}

export default async function SchedulesPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string }>;
}) {
  await requireAuth();
  const session = await getServerSession(authOptions);
  const user = session?.user as { role?: string; company?: Company | null } | undefined;
  const isAdmin = user?.role === "ADMIN";

  const { company: companyParam } = await searchParams;
  const active = resolveCompanyParam(companyParam, defaultCompany(user?.company));

  const schedules = await prisma.maintenanceSchedule.findMany({
    where: active === "ALL" ? {} : { company: active },
    orderBy: { nextDueDate: "asc" },
    include: {
      requirements: { include: { inventoryItem: true } },
      _count: { select: { tasks: true } },
    },
  });

  const schedulesWithSufficiency = schedules.map((s) => {
    const allSufficient = s.requirements.every(
      (r) => r.inventoryItem.currentQuantity >= r.quantityRequired
    );
    return { ...s, sufficient: allSufficient };
  });

  const now = new Date();
  const newHref = `/maintenance/schedules/new${active !== "ALL" ? `?company=${active}` : ""}`;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Maintenance Schedules</h1>
          <p className="text-gray-500 mt-1">Recurring maintenance tasks and their inventory needs</p>
        </div>
        {isAdmin && (
          <Link href={newHref}>
            <Button>+ New Schedule</Button>
          </Link>
        )}
      </div>

      <div className="mb-4">
        <CompanyFilterTabs basePath="/maintenance/schedules" active={active} />
      </div>

      {schedules.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <div className="text-4xl mb-4">🔧</div>
            <h3 className="text-base font-semibold text-gray-900 mb-1">No schedules yet</h3>
            {isAdmin && (
              <p className="text-sm text-gray-500 mb-6">Create your first maintenance schedule to get started.</p>
            )}
            {isAdmin && (
              <Link href={newHref}>
                <Button>+ New Schedule</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedulesWithSufficiency.map((schedule) => {
            const isOverdue = schedule.nextDueDate < now;
            const daysUntilDue = Math.ceil(
              (schedule.nextDueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
            );

            return (
              <Link key={schedule.id} href={`/maintenance/schedules/${schedule.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-gray-900">{schedule.title}</h3>
                          {!schedule.isActive && <Badge variant="default">Inactive</Badge>}
                          {active === "ALL" && (
                            <Badge variant="info">
                              {schedule.company === "RESORT" ? "Pet Resort" : "Mobile Grooming"}
                            </Badge>
                          )}
                        </div>
                        {schedule.description && (
                          <p className="text-xs text-gray-500 mb-2">{schedule.description}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>🔄 {formatRecurrenceInterval(schedule.recurrenceInterval, schedule.customIntervalDays)}</span>
                          <span>📋 {schedule._count.tasks} tasks generated</span>
                          {schedule.requirements.length > 0 && (
                            <span>📦 {schedule.requirements.length} inventory items required</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <Badge variant={isOverdue ? "danger" : daysUntilDue <= 7 ? "warning" : "default"}>
                          {isOverdue
                            ? `Overdue ${Math.abs(daysUntilDue)}d`
                            : daysUntilDue === 0
                            ? "Due today"
                            : `Due in ${daysUntilDue}d`}
                        </Badge>
                        {schedule.requirements.length > 0 && (
                          <Badge variant={schedule.sufficient ? "success" : "danger"}>
                            {schedule.sufficient ? "Stock OK" : "Low stock"}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
