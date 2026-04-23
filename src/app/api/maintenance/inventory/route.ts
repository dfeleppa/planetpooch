import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // TODO(phase-2+): add `company` column to InventoryItem + apply getCompanyFilter
  // so MANAGERs only see their own company's inventory. Blocked by schema migration.
  const items = await prisma.inventoryItem.findMany({
    orderBy: { name: "asc" },
    include: {
      category: true,
      _count: { select: { requirements: true, usages: true } },
    },
  });

  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { name, description, categoryId, unit, currentQuantity, minimumThreshold } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const item = await prisma.inventoryItem.create({
    data: {
      name,
      description: description ?? "",
      categoryId,
      unit: unit ?? "units",
      currentQuantity: currentQuantity ?? 0,
      minimumThreshold: minimumThreshold ?? 0,
    },
    include: {
      category: true,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
