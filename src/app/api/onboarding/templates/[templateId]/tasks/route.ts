import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import {
  CreateTemplateTaskSchema,
  ReorderTasksSchema,
} from "@/lib/validators/onboarding";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await params;

  const parsed = await validateBody(req, CreateTemplateTaskSchema);
  if (!parsed.ok) return parsed.response;
  const d = parsed.data;

  try {
    // Append to the end of the task list — server owns order on create.
    const last = await prisma.onboardingTemplateTask.findFirst({
      where: { templateId },
      orderBy: { order: "desc" },
    });
    const nextOrder = (last?.order ?? -1) + 1;

    const data: Prisma.OnboardingTemplateTaskUncheckedCreateInput = {
      templateId,
      type: d.type,
      title: d.title,
      description: d.description,
      required: d.required,
      order: nextOrder,
    };
    if (d.type === "ESIGN_REQUEST") data.handbookFileName = d.handbookFileName;
    if (d.type === "ADMIN_TASK" && d.externalUrl) data.externalUrl = d.externalUrl;

    const task = await prisma.onboardingTemplateTask.create({ data });
    return NextResponse.json(task, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create task";
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
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await params;

  const parsed = await validateBody(req, ReorderTasksSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await prisma.$transaction(
      parsed.data.taskIds.map((id, idx) =>
        prisma.onboardingTemplateTask.update({
          where: { id },
          data: { order: idx, templateId },
        })
      )
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reorder tasks";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
