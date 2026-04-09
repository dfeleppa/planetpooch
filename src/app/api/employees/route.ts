import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const employees = await prisma.user.findMany({
    where: { role: "EMPLOYEE" },
    select: { id: true, email: true, name: true, createdAt: true },
    orderBy: { name: "asc" },
  });

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

  const allCompletions = await prisma.lessonCompletion.findMany({
    where: { isCompleted: true },
    select: { userId: true, lessonId: true },
  });

  const completionsByUser = new Map<string, Set<string>>();
  for (const c of allCompletions) {
    if (!completionsByUser.has(c.userId)) {
      completionsByUser.set(c.userId, new Set());
    }
    completionsByUser.get(c.userId)!.add(c.lessonId);
  }

  const result = employees.map((emp) => {
    const userCompletions = completionsByUser.get(emp.id) || new Set();
    let totalLessons = 0;
    let totalCompleted = 0;

    const moduleProgress = modules.map((mod) => {
      const lessons = mod.subsections.flatMap((s) => s.lessons);
      const total = lessons.length;
      const completed = lessons.filter((l) => userCompletions.has(l.id)).length;
      totalLessons += total;
      totalCompleted += completed;
      return {
        moduleId: mod.id,
        moduleTitle: mod.title,
        totalLessons: total,
        completedLessons: completed,
      };
    });

    return {
      ...emp,
      totalLessons,
      completedLessons: totalCompleted,
      modules: moduleProgress,
    };
  });

  return NextResponse.json(result);
}
