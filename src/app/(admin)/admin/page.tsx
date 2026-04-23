import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function AdminDashboardPage() {
  await requireAdmin();

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: {
      subsections: {
        include: { lessons: { select: { id: true } } },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { isCompleted: true },
    select: { userId: true, lessonId: true },
  });

  const completionsByUser = new Map<string, Set<string>>();
  for (const c of completions) {
    if (!completionsByUser.has(c.userId)) completionsByUser.set(c.userId, new Set());
    completionsByUser.get(c.userId)!.add(c.lessonId);
  }

  const moduleLessons = modules.map((mod) => ({
    id: mod.id,
    title: mod.title,
    lessonIds: mod.subsections.flatMap((s) => s.lessons.map((l) => l.id)),
  }));

  const totalLessonsCount = moduleLessons.reduce((acc, m) => acc + m.lessonIds.length, 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
      <p className="text-gray-500 mt-1">Employee progress overview</p>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{employees.length}</p>
            <p className="text-sm text-gray-500">Employees</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{modules.length}</p>
            <p className="text-sm text-gray-500">Modules</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{totalLessonsCount}</p>
            <p className="text-sm text-gray-500">Total Lessons</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Matrix */}
      <Card className="mt-8">
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Employee Progress</h2>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Employee</th>
                  {moduleLessons.map((mod) => (
                    <th key={mod.id} className="text-center px-4 py-3 font-medium text-gray-600 min-w-[120px]">
                      {mod.title}
                    </th>
                  ))}
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Overall</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp) => {
                  const userCompletions = completionsByUser.get(emp.id) || new Set();
                  let empTotal = 0;
                  let empCompleted = 0;

                  return (
                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/admin/employees/${emp.id}`} className="font-medium text-gray-900 hover:text-blue-600">
                          {emp.name}
                        </Link>
                        <p className="text-xs text-gray-400">{emp.email}</p>
                      </td>
                      {moduleLessons.map((mod) => {
                        const total = mod.lessonIds.length;
                        const completed = mod.lessonIds.filter((id) => userCompletions.has(id)).length;
                        empTotal += total;
                        empCompleted += completed;
                        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

                        return (
                          <td key={mod.id} className="text-center px-4 py-3">
                            <Badge variant={pct === 100 ? "success" : pct > 0 ? "warning" : "default"}>
                              {pct}%
                            </Badge>
                          </td>
                        );
                      })}
                      <td className="text-center px-4 py-3">
                        {(() => {
                          const pct = empTotal > 0 ? Math.round((empCompleted / empTotal) * 100) : 0;
                          return (
                            <Badge variant={pct === 100 ? "success" : pct > 0 ? "info" : "default"}>
                              {pct}%
                            </Badge>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}

                {employees.length === 0 && (
                  <tr>
                    <td colSpan={moduleLessons.length + 2} className="px-4 py-8 text-center text-gray-500">
                      No employees registered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
