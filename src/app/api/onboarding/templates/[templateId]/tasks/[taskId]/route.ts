import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { UpdateTemplateTaskSchema } from "@/lib/validators/onboarding";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string; taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { taskId } = await params;

  const parsed = await validateBody(req, UpdateTemplateTaskSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const task = await prisma.onboardingTemplateTask.update({
      where: { id: taskId },
      data: parsed.data,
    });
    return NextResponse.json(task);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string; taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { taskId } = await params;

  try {
    await prisma.onboardingTemplateTask.delete({ where: { id: taskId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
