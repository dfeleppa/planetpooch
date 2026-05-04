import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove, hasModuleManagementAccess } from "@/lib/auth-helpers";
import { extractTextFromTiptapJson } from "@/lib/utils";
import { isModuleVisibleToUser } from "@/lib/module-visibility";

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
          module: { select: { id: true, title: true, order: true, notesEnabled: true } },
        },
      },
    },
  });

  if (!lesson) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isManagerOrAbove(session.user.role)) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { jobTitle: true },
    });
    const visible = await isModuleVisibleToUser(
      lesson.subsection.module.id,
      session.user.id,
      me?.jobTitle ?? null,
    );
    if (!visible) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const completion = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
  });

  // Walk the full module to find prev/next lessons across subsections.
  const moduleSubsections = await prisma.subsection.findMany({
    where: { moduleId: lesson.subsection.module.id },
    orderBy: { order: "asc" },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        select: { id: true, title: true },
      },
    },
  });
  const flatLessons = moduleSubsections.flatMap((s) => s.lessons);
  const currentIndex = flatLessons.findIndex((l) => l.id === lessonId);
  const prevLesson = currentIndex > 0 ? flatLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < flatLessons.length - 1
      ? flatLessons[currentIndex + 1]
      : null;

  // If we're on the last lesson of the module, surface the next module so the
  // user can continue without having to complete the current one first.
  let nextModule: { id: string; title: string; firstLessonId: string } | null = null;
  if (!nextLesson) {
    const candidates = await prisma.module.findMany({
      where: { order: { gt: lesson.subsection.module.order } },
      orderBy: { order: "asc" },
      include: {
        subsections: {
          orderBy: { order: "asc" },
          include: {
            lessons: { orderBy: { order: "asc" }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    const me = !isManagerOrAbove(session.user.role)
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { jobTitle: true },
        })
      : null;
    for (const candidate of candidates) {
      const firstLessonId = candidate.subsections.flatMap((s) => s.lessons)[0]?.id;
      if (!firstLessonId) continue;
      if (!isManagerOrAbove(session.user.role)) {
        const visible = await isModuleVisibleToUser(
          candidate.id,
          session.user.id,
          me?.jobTitle ?? null,
        );
        if (!visible) continue;
      }
      nextModule = { id: candidate.id, title: candidate.title, firstLessonId };
      break;
    }
  }

  return NextResponse.json({
    ...lesson,
    isCompleted: completion?.isCompleted ?? false,
    completedAt: completion?.completedAt ?? null,
    prevLesson,
    nextLesson,
    nextModule,
    module: lesson.subsection.module,
    subsectionTitle: lesson.subsection.title,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await getSession();
  if (!session?.user || !hasModuleManagementAccess(session.user.role, session.user.jobTitle)) {
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
  if (!session?.user || !hasModuleManagementAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { lessonId } = await params;
  await prisma.lesson.delete({ where: { id: lessonId } });
  return NextResponse.json({ success: true });
}
