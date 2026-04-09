import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { employeeId } = await params;

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });

  if (!employee || employee.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: {
      subsections: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true, estimatedMinutes: true },
          },
        },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: employeeId },
    select: { lessonId: true, isCompleted: true, completedAt: true },
  });

  const completionMap = new Map(completions.map((c) => [c.lessonId, c]));

  const auditLogs = await prisma.completionAuditLog.findMany({
    where: { userId: employeeId },
    orderBy: { timestamp: "desc" },
    take: 50,
    include: {
      lesson: { select: { title: true } },
    },
  });

  const moduleData = modules.map((mod) => {
    const subsections = mod.subsections.map((sub) => ({
      ...sub,
      lessons: sub.lessons.map((lesson) => {
        const comp = completionMap.get(lesson.id);
        return {
          ...lesson,
          isCompleted: comp?.isCompleted ?? false,
          completedAt: comp?.completedAt ?? null,
        };
      }),
    }));

    const allLessons = subsections.flatMap((s) => s.lessons);
    return {
      id: mod.id,
      title: mod.title,
      totalLessons: allLessons.length,
      completedLessons: allLessons.filter((l) => l.isCompleted).length,
      subsections,
    };
  });

  return NextResponse.json({
    employee,
    modules: moduleData,
    recentAuditLogs: auditLogs,
  });
}
