import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: {
      subsections: {
        include: {
          lessons: { select: { id: true } },
        },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: session.user.id, isCompleted: true },
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

    return {
      id: mod.id,
      title: mod.title,
      icon: mod.icon,
      totalLessons: total,
      completedLessons: completed,
    };
  });

  return NextResponse.json({
    overall: { totalLessons, completedLessons: totalCompleted },
    modules: moduleProgress,
  });
}
