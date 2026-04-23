import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

function isManagerOrAbove(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "ADMIN";
}

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
  if (!session?.user || !isManagerOrAbove((session.user as { role: string }).role)) {
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
