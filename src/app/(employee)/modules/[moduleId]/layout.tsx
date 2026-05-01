import { requireAuth } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { ModuleNavSidebar } from "@/components/modules/ModuleNavSidebar";

export default async function ModuleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ moduleId: string }>;
}) {
  const session = await requireAuth();
  const { moduleId } = await params;

  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      subsections: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true },
          },
        },
      },
    },
  });

  if (!mod) notFound();

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: session.user.id, isCompleted: true },
    select: { lessonId: true },
  });

  const completedLessonIds = completions.map((c) => c.lessonId);

  return (
    <div className="flex flex-col md:flex-row -m-4 md:-m-8 min-h-screen">
      <ModuleNavSidebar
        moduleId={moduleId}
        moduleTitle={mod.title}
        subsections={mod.subsections.map((s) => ({
          id: s.id,
          title: s.title,
          lessons: s.lessons,
        }))}
        completedLessonIds={completedLessonIds}
      />
      <div className="flex-1 p-4 md:p-8 min-w-0 overflow-auto">
        {children}
      </div>
    </div>
  );
}
