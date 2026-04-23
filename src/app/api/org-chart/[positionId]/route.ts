import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

function isManagerOrAbove(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "ADMIN";
}

async function loadPosition(positionId: string) {
  return prisma.orgPosition.findUnique({
    where: { id: positionId },
    select: { id: true, company: true, parentPositionId: true, assignedUserId: true },
  });
}

/**
 * PATCH — update title / parent / assigned user.
 * Body: { title?, parentPositionId?: string|null, assignedUserId?: string|null }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const { positionId } = await params;

  try {
    const position = await loadPosition(positionId);
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    if (
      companyFilter.company &&
      position.company !== null &&
      position.company !== companyFilter.company
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const data: {
      title?: string;
      parentPositionId?: string | null;
      assignedUserId?: string | null;
    } = {};

    if (typeof body.title === "string" && body.title.trim()) {
      data.title = body.title.trim();
    }

    if ("parentPositionId" in body) {
      const newParentId: string | null = body.parentPositionId ?? null;
      if (newParentId === positionId) {
        return NextResponse.json(
          { error: "A position can't be its own parent" },
          { status: 400 }
        );
      }
      if (newParentId) {
        // Verify parent visibility + prevent cycles
        let cursor: string | null = newParentId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === positionId) {
            return NextResponse.json(
              { error: "That would create a reporting cycle" },
              { status: 400 }
            );
          }
          if (seen.has(cursor)) break;
          seen.add(cursor);
          const p: { parentPositionId: string | null; company: Company | null } | null =
            await prisma.orgPosition.findUnique({
              where: { id: cursor },
              select: { parentPositionId: true, company: true },
            });
          if (!p) {
            return NextResponse.json({ error: "Parent not found" }, { status: 404 });
          }
          if (
            companyFilter.company &&
            p.company !== null &&
            p.company !== companyFilter.company
          ) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
          }
          cursor = p.parentPositionId;
        }
      }
      data.parentPositionId = newParentId;
    }

    if ("assignedUserId" in body) {
      const newUserId: string | null = body.assignedUserId ?? null;
      if (newUserId) {
        const user = await prisma.user.findUnique({
          where: { id: newUserId },
          select: { id: true, company: true },
        });
        if (!user) {
          return NextResponse.json({ error: "User not found" }, { status: 404 });
        }
        if (
          companyFilter.company &&
          user.company !== null &&
          user.company !== companyFilter.company
        ) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        // Unassign the user from any position they currently hold (schema enforces unique)
        await prisma.orgPosition.updateMany({
          where: { assignedUserId: newUserId, NOT: { id: positionId } },
          data: { assignedUserId: null },
        });
      }
      data.assignedUserId = newUserId;
    }

    const updated = await prisma.orgPosition.update({
      where: { id: positionId },
      data,
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE a position. Children get their parent set to this position's parent (re-parented up). */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ positionId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const { positionId } = await params;

  try {
    const position = await loadPosition(positionId);
    if (!position) {
      return NextResponse.json({ error: "Position not found" }, { status: 404 });
    }
    if (
      companyFilter.company &&
      position.company !== null &&
      position.company !== companyFilter.company
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Re-parent children one level up, then delete
    await prisma.$transaction([
      prisma.orgPosition.updateMany({
        where: { parentPositionId: positionId },
        data: { parentPositionId: position.parentPositionId },
      }),
      prisma.orgPosition.delete({ where: { id: positionId } }),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
