import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;

  const comments = await prisma.taskComment.findMany({
    where: { taskId },
    orderBy: { createdAt: "asc" },
    include: { user: { select: { id: true, name: true } } },
  });

  return NextResponse.json(comments);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const { content } = await req.json();

  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const comment = await prisma.taskComment.create({
    data: { taskId, userId: session.user.id, content },
    include: { user: { select: { id: true, name: true } } },
  });

  return NextResponse.json(comment, { status: 201 });
}
