import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { Company } from "@prisma/client";

const COMPANIES: Company[] = ["RESORT", "GROOMING"];

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const companyParam = req.nextUrl.searchParams.get("company");
  const company = COMPANIES.includes(companyParam as Company)
    ? (companyParam as Company)
    : null;

  const categories = await prisma.inventoryCategory.findMany({
    where: company ? { company } : {},
    orderBy: { name: "asc" },
  });

  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { name, color, company } = await req.json();

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Category name is required" }, { status: 400 });
    }

    if (!COMPANIES.includes(company)) {
      return NextResponse.json({ error: "company must be RESORT or GROOMING" }, { status: 400 });
    }

    const category = await prisma.inventoryCategory.create({
      data: {
        name: name.trim(),
        color: color || "bg-gray-100 text-gray-800",
        company,
      },
    });

    return NextResponse.json(category);
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json(
        { error: "Category with this name already exists for this company" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || "Failed to create category" },
      { status: 500 }
    );
  }
}
