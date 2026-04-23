import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");
  const assignedToMe = searchParams.get("assignedToMe") === "true";

  const tasks = await prisma.task.findMany({
    where: {
      ...(projectId && { projectId }),
      ...(status && { status: status as never }),
      parentTaskId: null,
      ...(assignedToMe && {
        assignees: { some: { userId: session.user.id } },
      }),
    },
    orderBy: [{ status: "asc" }, { order: "asc" }],
    include: {
      assignees: { include: { user: { select: { id: true, name: true } } } },
      _count: { select: { subtasks: true, comments: true } },
    },
  });

  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { title, description, status, priority, dueDate, projectId, subProjectId, parentTaskId, assigneeIds } = body;

  if (!title || !projectId) {
    return NextResponse.json({ error: "title and projectId are required" }, { status: 400 });
  }

  // Enforce single level of subtask nesting
  if (parentTaskId) {
    const parent = await prisma.task.findUnique({ where: { id: parentTaskId } });
    if (parent?.parentTaskId) {
      return NextResponse.json({ error: "Subtasks cannot have subtasks" }, { status: 400 });
    }
  }

  const count = await prisma.task.count({ where: { projectId, parentTaskId: parentTaskId ?? null } });

  const task = await prisma.$transaction(async (tx) => {
    const newTask = await tx.task.create({
      data: {
        title,
        description: description ?? "",
        status: status ?? "TODO",
        priority: priority ?? "MEDIUM",
        dueDate: dueDate ? new Date(dueDate) : null,
        projectId,
        subProjectId: subProjectId ?? null,
        parentTaskId: parentTaskId ?? null,
        createdById: session.user.id,
        order: count,
      },
    });

    if (assigneeIds?.length > 0) {
      await tx.taskAssignee.createMany({
        data: assigneeIds.map((userId: string) => ({ taskId: newTask.id, userId })),
        skipDuplicates: true,
      });
    }

    return newTask;
  });

  return NextResponse.json(task, { status: 201 });
}
