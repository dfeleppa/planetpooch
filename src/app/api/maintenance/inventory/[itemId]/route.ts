import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { canEditGroomingCounts, canEditGroomingRequirements } from "@/lib/grooming-inventory-access";
import { maintenanceCompanyWhere } from "@/lib/maintenance-access";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { itemId } = await params;

  const item = await prisma.inventoryItem.findUnique({
    where: { id: itemId, ...maintenanceCompanyWhere(session.user) },
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
  if (!session?.user || !canEditGroomingCounts(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  const existing = await prisma.inventoryItem.findUnique({ where: { id: itemId, ...maintenanceCompanyWhere(session.user) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid inventory update" }, { status: 400 });
  }
  if (!isManagerOrAbove(session.user.role) && !canEditGroomingRequirements(session.user, existing.company, body)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { name, description, unit, minimumThreshold, categoryId } = body;
  if (minimumThreshold !== undefined &&
      (typeof minimumThreshold !== "number" || !Number.isSafeInteger(minimumThreshold) || minimumThreshold < 0)) {
    return NextResponse.json({ error: "Required quantity must be a nonnegative whole number" }, { status: 400 });
  }

  if (categoryId !== undefined) {
    const item = await prisma.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const category = await prisma.inventoryCategory.findUnique({ where: { id: categoryId } });
    if (!category || category.company !== item.company) {
      return NextResponse.json(
        { error: "Category does not belong to the item's company" },
        { status: 400 }
      );
    }
  }

  const item = await prisma.inventoryItem.update({
    where: { id: itemId, ...maintenanceCompanyWhere(session.user) },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(unit !== undefined && { unit }),
      ...(minimumThreshold !== undefined && { minimumThreshold }),
      ...(categoryId !== undefined && { categoryId }),
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
  const existing = await prisma.inventoryItem.findUnique({ where: { id: itemId, ...maintenanceCompanyWhere(session.user) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.inventoryItem.delete({ where: { id: itemId, ...maintenanceCompanyWhere(session.user) } });
  return NextResponse.json({ success: true });
}
