import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canEditGroomingCounts } from "@/lib/grooming-inventory-access";
import { canAccessMaintenanceCompany } from "@/lib/maintenance-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!canEditGroomingCounts(session.user) || !canAccessMaintenanceCompany(session.user, "GROOMING")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  const { quantity } = await req.json();
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return NextResponse.json({ error: "On-hand count must be a nonnegative whole number" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item || item.company !== "GROOMING") return null;

    const count = await tx.inventoryCount.create({
      data: { inventoryItemId: itemId, quantity, countedById: session.user.id },
    });
    const delta = quantity - item.currentQuantity;
    if (delta !== 0) {
      await tx.inventoryAdjustment.create({
        data: { inventoryItemId: itemId, quantityChange: delta, reason: "Stock count", adjustedById: session.user.id },
      });
      await tx.inventoryItem.update({ where: { id: itemId }, data: { currentQuantity: quantity } });
    }
    return count;
  });

  if (!result) return NextResponse.json({ error: "Mobile Grooming item not found" }, { status: 404 });
  return NextResponse.json(result, { status: 201 });
}
