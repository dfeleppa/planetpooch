import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

export default async function ModulesPage() {
  const session = await requireAuth();
  const userId = session.user.id;

  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: {
      subsections: {
        include: {
          lessons: { select: { id: true } },
        },
      },
      prerequisites: {
        include: {
          prerequisite: { select: { id: true, title: true } },
        },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId, isCompleted: true },
    select: { lessonId: true },
  });

  const completedSet = new Set(completions.map((c) => c.lessonId));

  // Calculate per-module completion for prerequisite checking
  const moduleCompletionMap = new Map<string, boolean>();
  for (const mod of modules) {
    const lessons = mod.subsections.flatMap((s) => s.lessons);
    const allComplete = lessons.length > 0 && lessons.every((l) => completedSet.has(l.id));
    moduleCompletionMap.set(mod.id, allComplete);
  }

  const modulesWithProgress = modules.map((mod) => {
    const lessons = mod.subsections.flatMap((s) => s.lessons);
    const total = lessons.length;
    const completed = lessons.filter((l) => completedSet.has(l.id)).length;

    const unmetPrereqs = mod.prerequisites
      .filter((p) => !moduleCompletionMap.get(p.prerequisiteModuleId))
      .map((p) => p.prerequisite);

    return {
      ...mod,
      totalLessons: total,
      completedLessons: completed,
      isLocked: unmetPrereqs.length > 0,
      unmetPrereqs,
    };
  });

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900">Modules</h1>
      <p className="text-gray-500 mt-1">Browse all training modules</p>

      <div className="grid gap-4 mt-6">
        {modulesWithProgress.map((mod) => (
          <Card key={mod.id} className={`transition-shadow ${mod.isLocked ? "opacity-60" : "hover:shadow-md"}`}>
            <CardContent className="py-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    {mod.icon && <span className="text-xl">{mod.icon}</span>}
                    {mod.isLocked ? (
                      <span className="text-lg font-medium text-gray-500">{mod.title}</span>
                    ) : (
                      <Link href={`/modules/${mod.id}`} className="text-lg font-medium text-gray-900 hover:text-blue-600">
                        {mod.title}
                      </Link>
                    )}
                    {mod.completedLessons === mod.totalLessons && mod.totalLessons > 0 && (
                      <Badge variant="success">Complete</Badge>
                    )}
                    {mod.isLocked && <Badge variant="warning">Locked</Badge>}
                  </div>
                  {mod.description && <p className="text-sm text-gray-500 mt-1">{mod.description}</p>}
                  {mod.isLocked && (
                    <p className="text-sm text-amber-600 mt-2">
                      Requires: {mod.unmetPrereqs.map((p) => p.title).join(", ")}
                    </p>
                  )}
                  {!mod.isLocked && (
                    <div className="mt-3">
                      <ProgressBar value={mod.completedLessons} max={mod.totalLessons} />
                      <p className="text-xs text-gray-400 mt-1">
                        {mod.completedLessons} / {mod.totalLessons} lessons
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
