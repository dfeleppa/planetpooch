import { requireAuth, isManagerOrAbove } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isModuleVisibleToUser } from "@/lib/module-visibility";

export default async function ModuleDetailPage({
  params,
}: {
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
            select: { id: true },
          },
        },
      },
    },
  });

  if (!mod) notFound();

  // Managers/super admins can preview any module; employees can only open
  // modules assigned to them via job title or individual assignment.
  if (!isManagerOrAbove(session.user.role)) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { jobTitle: true },
    });
    const visible = await isModuleVisibleToUser(
      moduleId,
      session.user.id,
      me?.jobTitle ?? null,
    );
    if (!visible) notFound();
  }

  const allLessons = mod.subsections.flatMap((s) => s.lessons);

  if (allLessons.length === 0) notFound();

  // Check for last visited lesson cookie
  const cookieStore = await cookies();
  const lastLessonId = cookieStore.get(`portal-last-lesson-${moduleId}`)?.value;

  if (lastLessonId && allLessons.some((l) => l.id === lastLessonId)) {
    redirect(`/modules/${moduleId}/lessons/${lastLessonId}`);
  }

  // Otherwise redirect to first lesson of first subsection
  redirect(`/modules/${moduleId}/lessons/${allLessons[0].id}`);
}
