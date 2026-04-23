import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const session = await getSession();
  if (!session?.user || (session.user as { role: string }).role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { itemId } = await params;
  const body = await req.json();
  const { quantityChange, reason } = body;

  if (typeof quantityChange !== "number" || quantityChange === 0) {
    return NextResponse.json({ error: "quantityChange must be a non-zero number" }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const adjustment = await tx.inventoryAdjustment.create({
      data: {
        inventoryItemId: itemId,
        quantityChange,
        reason: reason ?? "",
        adjustedById: session.user.id,
      },
    });

    const item = await tx.inventoryItem.update({
      where: { id: itemId },
      data: { currentQuantity: { increment: quantityChange } },
    });

    return { adjustment, item };
  });

  return NextResponse.json(result, { status: 201 });
}
