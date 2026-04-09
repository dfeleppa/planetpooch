import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const { userId } = await req.json();

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  const assignee = await prisma.taskAssignee.upsert({
    where: { taskId_userId: { taskId, userId } },
    create: { taskId, userId },
    update: {},
    include: { user: { select: { id: true, name: true } } },
  });

  return NextResponse.json(assignee, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { taskId } = await params;
  const userId = req.nextUrl.searchParams.get("userId");

  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  await prisma.taskAssignee.delete({
    where: { taskId_userId: { taskId, userId } },
  });

  return NextResponse.json({ success: true });
}
