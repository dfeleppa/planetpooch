import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string; subsectionId: string }> }
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subsectionId } = await params;
  const body = await req.json();
  const { title, description } = body;

  const subsection = await prisma.subsection.update({
    where: { id: subsectionId },
    data: {
      ...(title !== undefined && { title }),
      ...(description !== undefined && { description }),
    },
  });

  return NextResponse.json(subsection);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string; subsectionId: string }> }
) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { subsectionId } = await params;
  await prisma.subsection.delete({ where: { id: subsectionId } });
  return NextResponse.json({ success: true });
}
