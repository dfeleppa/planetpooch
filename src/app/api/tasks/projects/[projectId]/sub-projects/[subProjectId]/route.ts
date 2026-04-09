import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; subProjectId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subProjectId } = await params;
  const body = await req.json();
  const { name, description } = body;

  const sub = await prisma.subProject.update({
    where: { id: subProjectId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
    },
  });

  return NextResponse.json(sub);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; subProjectId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { subProjectId } = await params;
  await prisma.subProject.delete({ where: { id: subProjectId } });
  return NextResponse.json({ success: true });
}
