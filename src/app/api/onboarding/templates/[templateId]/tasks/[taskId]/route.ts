import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string; taskId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { taskId } = await params;

  try {
    const body = await req.json();
    const { title, description, required, handbookFileName, externalUrl } = body;
    const data: {
      title?: string;
      description?: string;
      required?: boolean;
      handbookFileName?: string | null;
      externalUrl?: string | null;
    } = {};

    if (typeof title === "string" && title.trim()) data.title = title.trim();
    if (typeof description === "string") data.description = description.trim();
    if (typeof required === "boolean") data.required = required;
    if (typeof handbookFileName === "string") {
      data.handbookFileName = handbookFileName.trim() || null;
    }
    if (typeof externalUrl === "string") {
      data.externalUrl = externalUrl.trim() || null;
    }

    const task = await prisma.onboardingTemplateTask.update({
      where: { id: taskId },
      data,
    });

    return NextResponse.json(task);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update task";
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
    const message = err instanceof Error ? err.message : "Failed to delete task";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
