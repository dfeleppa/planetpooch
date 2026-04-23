import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId },
    include: {
      adjustments: {
        orderBy: { createdAt: "desc" },
        include: { adjustedBy: { select: { id: true, name: true } } },
      },
      usages: {
        orderBy: { recordedAt: "desc" },
        include: {
          maintenanceTask: { select: { id: true, title: true, completedAt: true } },
        },
      },
    },
  });

  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(item);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  const body = await req.json();
  const { name, description, unit, minimumThreshold } = body;

  const item = await prisma.inventoryItem.update({
    where: { id: itemId },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(unit !== undefined && { unit }),
      ...(minimumThreshold !== undefined && { minimumThreshold }),
    },
  });

  return NextResponse.json(item);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  await prisma.inventoryItem.delete({ where: { id: itemId } });
  return NextResponse.json({ success: true });
}
