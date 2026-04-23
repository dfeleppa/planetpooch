import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { extractTextFromTiptapJson } from "@/lib/utils";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !["SUPER_ADMIN","ADMIN"].includes(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { title, subsectionId, content, estimatedMinutes } = body;

  if (!title || !subsectionId) {
    return NextResponse.json({ error: "Title and subsectionId are required" }, { status: 400 });
  }

  const maxOrder = await prisma.lesson.aggregate({
    where: { subsectionId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  const lesson = await prisma.lesson.create({
    data: {
      title,
      subsectionId,
      order,
      content: content || {},
      estimatedMinutes: estimatedMinutes || null,
      searchText: content ? extractTextFromTiptapJson(content) : "",
    },
  });

  return NextResponse.json(lesson, { status: 201 });
}
