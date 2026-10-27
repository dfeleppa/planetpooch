import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { canManageMaintenance, maintenanceCompanyWhere } from "@/lib/maintenance-access";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { itemId } = await params;
  if (!canManageMaintenance(session.user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const existing = await prisma.inventoryItem.findUnique({ where: { id: itemId, ...maintenanceCompanyWhere(session.user) } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await req.json();
  const { quantityChange, reason } = body;

  if (!Number.isSafeInteger(quantityChange) || quantityChange === 0 || Math.abs(quantityChange) > 2_147_483_647) {
    return NextResponse.json({ error: "quantityChange must be a non-zero number" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.inventoryItem.updateMany({
      where: { id: itemId, ...maintenanceCompanyWhere(session.user), currentQuantity: {
        gte: Math.max(0, -quantityChange), lte: 2_147_483_647 - Math.max(0, quantityChange),
      } },
      data: { currentQuantity: { increment: quantityChange } },
    });
    if (updated.count !== 1) return null;
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        inventoryItemId: itemId,
        quantityChange,
        reason: reason ?? "",
        adjustedById: session.user.id,
      },
    });

    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });

    return { adjustment, item };
  });

  return result ? NextResponse.json(result, { status: 201 })
    : NextResponse.json({ error: "Adjustment would make inventory invalid" }, { status: 409 });
}
