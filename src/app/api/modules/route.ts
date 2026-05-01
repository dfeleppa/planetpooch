import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const where: { id?: { in: string[] } } = {};
  if (!isManagerOrAbove(session.user.role)) {
    const me = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { jobTitle: true },
    });
    const ids = await getVisibleModuleIdsForUser(session.user.id, me?.jobTitle ?? null);
    where.id = { in: [...ids] };
  }

  const modules = await prisma.module.findMany({
    where,
    orderBy: { order: "asc" },
    include: {
      subsections: {
        include: {
          lessons: {
            select: { id: true },
          },
        },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: session.user.id, isCompleted: true },
    select: { lessonId: true },
  });

  const completedSet = new Set(completions.map((c) => c.lessonId));

  const result = modules.map((mod) => {
    const allLessons = mod.subsections.flatMap((s) => s.lessons);
    const totalLessons = allLessons.length;
    const completedLessons = allLessons.filter((l) => completedSet.has(l.id)).length;
    return {
      id: mod.id,
      title: mod.title,
      description: mod.description,
      order: mod.order,
      icon: mod.icon,
      totalLessons,
      completedLessons,
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !["SUPER_ADMIN","ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, description, icon } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const maxOrder = await prisma.module.aggregate({ _max: { order: true } });
  const order = (maxOrder._max.order ?? -1) + 1;

  const module = await prisma.module.create({
    data: { title, description: description || "", icon, order },
  });

  return NextResponse.json(module, { status: 201 });
}
