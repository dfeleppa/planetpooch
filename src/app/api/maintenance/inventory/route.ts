import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { Company } from "@prisma/client";

const COMPANIES: Company[] = ["RESORT", "GROOMING"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyParam = req.nextUrl.searchParams.get("company");
  const company = COMPANIES.includes(companyParam as Company)
    ? (companyParam as Company)
    : null;

  const items = await prisma.inventoryItem.findMany({
    where: company ? { company } : {},
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
  const { name, description, categoryId, unit, currentQuantity, minimumThreshold, company } = body;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  if (!COMPANIES.includes(company)) {
    return NextResponse.json({ error: "company must be RESORT or GROOMING" }, { status: 400 });
  }

  const category = await prisma.inventoryCategory.findUnique({ where: { id: categoryId } });
  if (!category || category.company !== company) {
    return NextResponse.json(
      { error: "Category does not belong to the selected company" },
      { status: 400 }
    );
  }

  const item = await prisma.inventoryItem.create({
    data: {
      name,
      description: description ?? "",
      categoryId,
      unit: unit ?? "units",
      currentQuantity: currentQuantity ?? 0,
      minimumThreshold: minimumThreshold ?? 0,
      company,
    },
    include: {
      category: true,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
