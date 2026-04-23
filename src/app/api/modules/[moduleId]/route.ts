import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { moduleId } = await params;

  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    include: {
      subsections: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: {
              id: true,
              title: true,
              order: true,
              estimatedMinutes: true,
            },
          },
        },
      },
      prerequisites: {
        include: {
          prerequisite: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!mod) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: session.user.id, isCompleted: true },
    select: { lessonId: true, completedAt: true },
  });

  const completionMap = new Map(completions.map((c) => [c.lessonId, c.completedAt]));

  const subsections = mod.subsections.map((sub) => ({
    ...sub,
    lessons: sub.lessons.map((lesson) => ({
      ...lesson,
      isCompleted: completionMap.has(lesson.id),
      completedAt: completionMap.get(lesson.id) || null,
    })),
  }));

  return NextResponse.json({
    ...mod,
    subsections,
    prerequisites: mod.prerequisites.map((p) => p.prerequisite),
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const body = await req.json();
  const { title, description, icon } = body;

  const mod = await prisma.module.update({
    where: { id: moduleId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
      ...(icon !== undefined && { icon }),
    },
  });

  return NextResponse.json(mod);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  await prisma.module.delete({ where: { id: moduleId } });
  return NextResponse.json({ success: true });
}
