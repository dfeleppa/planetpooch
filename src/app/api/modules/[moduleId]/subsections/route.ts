import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { moduleId } = await params;

  const subsections = await prisma.subsection.findMany({
    where: { moduleId },
    orderBy: { order: "asc" },
    include: {
      lessons: {
        orderBy: { order: "asc" },
        select: { id: true, title: true, order: true },
      },
    },
  });

  return NextResponse.json(subsections);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN" && role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const body = await req.json();
  const { title, description } = body;

  if (!title) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const maxOrder = await prisma.subsection.aggregate({
    where: { moduleId },
    _max: { order: true },
  });
  const order = (maxOrder._max.order ?? -1) + 1;

  const subsection = await prisma.subsection.create({
    data: { title, description: description || "", order, moduleId },
  });

  return NextResponse.json(subsection, { status: 201 });
}
