import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

function isManagerOrAbove(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "ADMIN";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { templateId } = await params;

  const template = await prisma.onboardingTemplate.findUnique({
    where: { id: templateId },
    include: {
      tasks: { orderBy: { order: "asc" } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  return NextResponse.json(template);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await params;

  try {
    const { name, description, isActive } = await req.json();
    const data: {
      name?: string;
      description?: string;
      isActive?: boolean;
    } = {};

    if (typeof name === "string" && name.trim()) data.name = name.trim();
    if (typeof description === "string") data.description = description.trim();
    if (typeof isActive === "boolean") data.isActive = isActive;

    const template = await prisma.onboardingTemplate.update({
      where: { id: templateId },
      data,
    });

    return NextResponse.json(template);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ templateId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { templateId } = await params;

  try {
    await prisma.onboardingTemplate.delete({ where: { id: templateId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
