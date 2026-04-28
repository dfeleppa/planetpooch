import { requireManager, getCompanyFilter } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { Company, Role } from "@prisma/client";

const COMPANY_LABELS: Record<Company, string> = {
  GROOMING: "Planet Pooch Grooming",
  RESORT: "Planet Pooch Resort",
  CORPORATE: "Planet Pooch Corporate",
};

export default async function AdminEmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const session = await requireManager();
  const sessionUser = session.user as { role: Role; company: Company };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  const { status } = await searchParams;
  const tab = status === "terminated" ? "terminated" : "active";

  const terminationFilter =
    tab === "terminated"
      ? { terminatedAt: { not: null } }
      : { terminatedAt: null };

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE", ...companyFilter, ...terminationFilter },
    orderBy:
      tab === "terminated"
        ? [{ terminatedAt: "desc" }, { lastName: "asc" }]
        : [{ lastName: "asc" }, { firstName: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      company: true,
      jobTitle: true,
      createdAt: true,
      terminatedAt: true,
      terminationReason: true,
    },
  });

  const totalLessons = await prisma.lesson.count();

  const completions = await prisma.lessonCompletion.findMany({
    where: { isCompleted: true, userId: { in: employees.map((e) => e.id) } },
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
          <p className="text-gray-500 mt-1">
            {tab === "terminated"
              ? "Past employees — records preserved for retention."
              : "Track employee training progress"}
          </p>
        </div>
        {tab === "active" && (
          <Link href="/admin/employees/new">
            <Button>+ Add Employee</Button>
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="mt-6 border-b border-gray-200 flex gap-6">
        <Link
          href="/admin/employees"
          className={`pb-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
            tab === "active"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Active
        </Link>
        <Link
          href="/admin/employees?status=terminated"
          className={`pb-2 -mb-px text-sm font-medium border-b-2 transition-colors ${
            tab === "terminated"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Past Employees
        </Link>
      </div>

      <div className="grid gap-4 mt-4">
        {employees.map((emp) => {
          const completed = completionCounts.get(emp.id) || 0;
          const isTerminated = !!emp.terminatedAt;
          return (
            <Card
              key={emp.id}
              className={`hover:shadow-md transition-shadow ${
                isTerminated ? "opacity-75" : ""
              }`}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/admin/employees/${emp.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {emp.name}
                      </Link>
                      {emp.jobTitle && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          {emp.jobTitle}
                        </span>
                      )}
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                        {COMPANY_LABELS[emp.company]}
                      </span>
                      {isTerminated && (
                        <Badge variant="default">Past employee</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{emp.email}</p>
                    {isTerminated && emp.terminatedAt ? (
                      <p className="text-xs text-gray-400 mt-1">
                        Terminated {formatDate(emp.terminatedAt)}
                        {emp.terminationReason && ` · ${emp.terminationReason}`}
                      </p>
                    ) : (
                      <p className="text-xs text-gray-400 mt-1">
                        Joined {formatDate(emp.createdAt)}
                      </p>
                    )}
                    {!isTerminated && (
                      <ProgressBar
                        value={completed}
                        max={totalLessons}
                        className="mt-2"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/admin/employees/${emp.id}`}>
                      <Badge variant="info">View Details</Badge>
                    </Link>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}

        {employees.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              {tab === "terminated"
                ? "No past employees."
                : "No employees registered yet."}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
