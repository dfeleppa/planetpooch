import { NextRequest, NextResponse } from "next/server";
import { OnboardingTaskType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

const VALID_TYPES: OnboardingTaskType[] = [
  "ESIGN_REQUEST",
  "EMPLOYEE_CONFIRM",
  "ADMIN_FILE_UPLOAD",
  "ADMIN_TASK",
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await getSession();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await params;

  try {
    const body = await req.json();
    const { type, title, description, required, handbookFileName, externalUrl } = body;

    if (!type || !VALID_TYPES.includes(type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }
    if (!title || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // Compute next order value at the end of the list
    const last = await prisma.onboardingTemplateTask.findFirst({
      where: { templateId },
      orderBy: { order: "desc" },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const task = await prisma.onboardingTemplateTask.create({
      data: {
        templateId,
        type,
        title: title.trim(),
        description: description?.trim() ?? "",
        required: required ?? true,
        order: nextOrder,
        handbookFileName: handbookFileName?.trim() || null,
        externalUrl: externalUrl?.trim() || null,
      },
    });

    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Reorder tasks. Body: { taskIds: string[] } — new order left-to-right.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await getSession();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await params;

  try {
    const { taskIds } = await req.json();
    if (!Array.isArray(taskIds)) {
      return NextResponse.json({ error: "taskIds must be an array" }, { status: 400 });
    }

    await prisma.$transaction(
      taskIds.map((id: string, idx: number) =>
        prisma.onboardingTemplateTask.update({
          where: { id },
          data: { order: idx, templateId },
        })
      )
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to reorder tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
