import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import Link from "next/link";

export default async function DashboardPage() {
  const session = await requireAuth();
  const userId = session.user.id;

  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: {
      subsections: {
        include: {
          lessons: { select: { id: true, title: true } },
        },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId, isCompleted: true },
    select: { lessonId: true },
  });

  const completedSet = new Set(completions.map((c) => c.lessonId));

  let totalLessons = 0;
  let totalCompleted = 0;

  const moduleProgress = modules.map((mod) => {
    const lessons = mod.subsections.flatMap((s) => s.lessons);
    const total = lessons.length;
    const completed = lessons.filter((l) => completedSet.has(l.id)).length;
    totalLessons += total;
    totalCompleted += completed;

    // Find first incomplete lesson for "continue" link
    let continueLesson: { id: string; title: string } | null = null;
    for (const sub of mod.subsections) {
      for (const lesson of sub.lessons) {
        if (!completedSet.has(lesson.id)) {
          continueLesson = lesson;
          break;
        }
      }
      if (continueLesson) break;
    }

    return { ...mod, totalLessons: total, completedLessons: completed, continueLesson };
  });

  const overallPercentage = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      <p className="text-gray-500 mt-1">Welcome back, {session.user.name}</p>

      {/* Overall Progress */}
      <Card className="mt-6">
        <CardContent className="py-6">
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 rounded-full border-4 border-blue-500 flex items-center justify-center">
              <span className="text-xl font-bold text-blue-700">{overallPercentage}%</span>
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Overall Progress</h2>
              <p className="text-sm text-gray-500">{totalCompleted} of {totalLessons} lessons completed</p>
              <ProgressBar value={totalCompleted} max={totalLessons} className="mt-2" size="lg" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Module Progress */}
      <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-4">Your Modules</h2>
      <div className="grid gap-4">
        {moduleProgress.map((mod) => (
          <Card key={mod.id} className="hover:shadow-md transition-shadow">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {mod.icon && <span className="text-xl">{mod.icon}</span>}
                    <Link href={`/modules/${mod.id}`} className="text-lg font-medium text-gray-900 hover:text-blue-600">
                      {mod.title}
                    </Link>
                  </div>
                  {mod.description && (
                    <p className="text-sm text-gray-500 mt-1">{mod.description}</p>
                  )}
                  <ProgressBar value={mod.completedLessons} max={mod.totalLessons} className="mt-3" />
                </div>
                {mod.continueLesson && mod.completedLessons < mod.totalLessons && (
                  <Link
                    href={`/modules/${mod.id}/lessons/${mod.continueLesson.id}`}
                    className="ml-4 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors whitespace-nowrap"
                  >
                    Continue
                  </Link>
                )}
                {mod.completedLessons === mod.totalLessons && mod.totalLessons > 0 && (
                  <span className="ml-4 px-4 py-2 bg-green-100 text-green-700 text-sm font-medium rounded-lg">
                    Complete!
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {modules.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No modules available yet. Check back soon!
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
