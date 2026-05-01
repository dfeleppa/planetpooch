import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { isModuleVisibleToUser } from "@/lib/module-visibility";

export async function POST(req: NextRequest, { params }: { params: Promise<{ lessonId: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lessonId } = await params;
  const userId = session.user.id;

  if (!isManagerOrAbove(session.user.role)) {
    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        subsection: { select: { module: { select: { id: true } } } },
      },
    });
    if (!lesson) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { jobTitle: true },
    });
    const visible = await isModuleVisibleToUser(
      lesson.subsection.module.id,
      userId,
      me?.jobTitle ?? null,
    );
    if (!visible) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
  }

  const existing = await prisma.lessonCompletion.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
  });

  if (!existing || !existing.isCompleted) {
    // Mark as completed
    const result = await prisma.$transaction(async (tx) => {
      const completion = await tx.lessonCompletion.upsert({
        where: { userId_lessonId: { userId, lessonId } },
        update: { isCompleted: true, completedAt: new Date() },
        create: { userId, lessonId, isCompleted: true },
      });

      await tx.completionAuditLog.create({
        data: {
          userId,
          lessonId,
          action: "COMPLETED",
        },
      });

      return completion;
    });

    return NextResponse.json({ isCompleted: true, completedAt: result.completedAt });
  } else {
    // Unmark completion
    const result = await prisma.$transaction(async (tx) => {
      const completion = await tx.lessonCompletion.update({
        where: { userId_lessonId: { userId, lessonId } },
        data: { isCompleted: false },
      });

      await tx.completionAuditLog.create({
        data: {
          userId,
          lessonId,
          action: "UNCOMPLETED",
          previousCompletedAt: existing.completedAt,
        },
      });

      return completion;
    });

    return NextResponse.json({ isCompleted: false, completedAt: result.completedAt });
  }
}
