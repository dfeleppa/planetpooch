import { requireManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Company, Role } from "@prisma/client";
import { DeleteEmployeeButton } from "./DeleteEmployeeButton";

export default async function AdminEmployeesPage() {
  const session = await requireManager();
  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", ...companyFilter },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, company: true, jobTitle: true, createdAt: true },
  });

  const totalLessons = await prisma.lesson.count();

  const completions = await prisma.lessonCompletion.findMany({
    where: { isCompleted: true },
    select: { userId: true },
  });

  const completionCounts = new Map<string, number>();
  for (const c of completions) {
    completionCounts.set(c.userId, (completionCounts.get(c.userId) || 0) + 1);
  }

  const COMPANY_LABELS: Record<Company, string> = {
    MOBILE: "Planet Pooch Mobile Inc",
    RESORT: "Planet Pooch Pet Resort Inc",
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 mt-1">Track employee training progress</p>
        </div>
        <Link href="/admin/employees/new">
          <Button>+ Add Employee</Button>
        </Link>
      </div>

      <div className="grid gap-4 mt-6">
        {employees.map((emp) => {
          const completed = completionCounts.get(emp.id) || 0;
          return (
            <Card key={emp.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/admin/employees/${emp.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                        {emp.name}
                      </Link>
                      {emp.jobTitle && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {emp.jobTitle}
                        </span>
                      )}
                      {emp.company && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                          {COMPANY_LABELS[emp.company]}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{emp.email}</p>
                    <p className="text-xs text-gray-400 mt-1">Joined {formatDate(emp.createdAt)}</p>
                    <ProgressBar value={completed} max={totalLessons} className="mt-2" />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/admin/employees/${emp.id}`}>
                      <Badge variant="info">View Details</Badge>
                    </Link>
                    <DeleteEmployeeButton employeeId={emp.id} employeeName={emp.name} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {employees.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No employees registered yet.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
