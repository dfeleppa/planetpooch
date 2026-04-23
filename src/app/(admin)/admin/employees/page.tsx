import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function AdminEmployeesPage() {
  await requireAdmin();

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, createdAt: true },
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

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-gray-500 mt-1">Track employee onboarding progress</p>
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
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Link href={`/admin/employees/${emp.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                      {emp.name}
                    </Link>
                    <p className="text-sm text-gray-500">{emp.email}</p>
                    <p className="text-xs text-gray-400 mt-1">Joined {formatDate(emp.createdAt)}</p>
                    <ProgressBar value={completed} max={totalLessons} className="mt-2" />
                  </div>
                  <Link href={`/admin/employees/${emp.id}`}>
                    <Badge variant="info">View Details</Badge>
                  </Link>
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
