import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasModuleEditAccess, isManagerOrAbove } from "@/lib/auth-helpers";
import { isModuleVisibleToUser } from "@/lib/module-visibility";

async function canAccessLesson(
  lessonId: string,
  user: { id: string; role?: string | null; jobTitle?: string | null },
) {
  if (isManagerOrAbove(user.role) || hasModuleEditAccess(user.role, user.jobTitle)) {
    return true;
  }

  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      subsection: { select: { module: { select: { id: true } } } },
    },
  });
  if (!lesson) return false;

  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { jobTitle: true, company: true },
  });
  return isModuleVisibleToUser(
    lesson.subsection.module.id,
    user.id,
    me?.jobTitle ?? null,
    me?.company ?? null,
  );
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const allowed = await canAccessLesson(lessonId, session.user);
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const note = await prisma.employeeNote.findUnique({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
  });

  return NextResponse.json({ content: note?.content || "" });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const allowed = await canAccessLesson(lessonId, session.user);
  if (!allowed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { content } = await req.json();

  const note = await prisma.employeeNote.upsert({
    where: { userId_lessonId: { userId: session.user.id, lessonId } },
    update: { content },
    create: { userId: session.user.id, lessonId, content },
  });

  return NextResponse.json(note);
}
