import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { extractTextFromTiptapJson } from "@/lib/utils";

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: {
      subsection: {
        include: {
          module: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const completion = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
  });

  // Get prev/next lessons
  const siblingLessons = await prisma.lesson.findMany({
    where: { subsectionId: lesson.subsectionId },
    orderBy: { order: "asc" },
    select: { id: true, title: true, order: true },
  });

  const currentIndex = siblingLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? siblingLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < siblingLessons.length - 1 ? siblingLessons[currentIndex + 1] : null;

  return NextResponse.json({
    ...lesson,
    isCompleted: completion?.isCompleted ?? false,
    completedAt: completion?.completedAt ?? null,
    prevLesson,
    nextLesson,
    module: lesson.subsection.module,
    subsectionTitle: lesson.subsection.title,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;
  const body = await req.json();
  const { title, content, estimatedMinutes } = body;

  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (estimatedMinutes !== undefined) data.estimatedMinutes = estimatedMinutes;
  if (content !== undefined) {
    data.content = content;
    data.searchText = extractTextFromTiptapJson(content);
  }

  const lesson = await prisma.lesson.update({
    where: { id: lessonId },
    data,
  });

  return NextResponse.json(lesson);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;
  await prisma.lesson.delete({ where: { id: lessonId } });
  return NextResponse.json({ success: true });
}
