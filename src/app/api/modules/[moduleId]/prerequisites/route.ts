import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";

async function wouldCreateCycle(moduleId: string, prerequisiteId: string): Promise<boolean> {
  // BFS from prerequisiteId's own prerequisites to check if moduleId is reachable
  const visited = new Set<string>();
  const queue = [prerequisiteId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === moduleId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = await prisma.modulePrerequisite.findMany({
      where: { moduleId: current },
      select: { prerequisiteModuleId: true },
    });

    for (const dep of deps) {
      queue.push(dep.prerequisiteModuleId);
    }
  }

  return false;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { moduleId } = await params;

  const prerequisites = await prisma.modulePrerequisite.findMany({
    where: { moduleId },
    include: { prerequisite: { select: { id: true, title: true } } },
  });

  return NextResponse.json(prerequisites.map((p) => p.prerequisite));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ moduleId: string }> }) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const { prerequisiteIds } = await req.json();

  if (!Array.isArray(prerequisiteIds)) {
    return NextResponse.json({ error: "prerequisiteIds must be an array" }, { status: 400 });
  }

  // Check for cycles
  for (const prereqId of prerequisiteIds) {
    if (prereqId === moduleId) {
      return NextResponse.json({ error: "A module cannot be its own prerequisite" }, { status: 400 });
    }
    const cycle = await wouldCreateCycle(prereqId, moduleId);
    if (cycle) {
      return NextResponse.json(
        { error: `Adding prerequisite would create a circular dependency` },
        { status: 400 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.modulePrerequisite.deleteMany({ where: { moduleId } });
    if (prerequisiteIds.length > 0) {
      await tx.modulePrerequisite.createMany({
        data: prerequisiteIds.map((prereqId: string) => ({
          moduleId,
          prerequisiteModuleId: prereqId,
        })),
      });
    }
  });

  return NextResponse.json({ success: true });
}
