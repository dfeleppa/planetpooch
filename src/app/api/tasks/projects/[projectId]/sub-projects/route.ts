import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;

  const subProjects = await prisma.subProject.findMany({
    where: { projectId },
    orderBy: { order: "asc" },
    include: { _count: { select: { tasks: true } } },
  });

  return NextResponse.json(subProjects);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId } = await params;
  const body = await req.json();
  const { name, description } = body;

  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

  const count = await prisma.subProject.count({ where: { projectId } });

  const subProject = await prisma.subProject.create({
    data: { name, description: description ?? "", projectId, order: count },
  });

  return NextResponse.json(subProject, { status: 201 });
}
