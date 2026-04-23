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

  const subtasks = await prisma.task.findMany({
    where: { parentTaskId: taskId },
    orderBy: { order: "asc" },
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
  });

  return NextResponse.json(subtasks);
}
