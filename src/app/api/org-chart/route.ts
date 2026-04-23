import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

/**
 * GET — returns all positions + all users (for the Assign picker).
 * MANAGER scope: only their company's positions/users.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  // For MANAGER: positions where company === their company OR company IS NULL (leadership)
  // For SUPER_ADMIN: everything
  const positionWhere = companyFilter.company
    ? { OR: [{ company: companyFilter.company }, { company: null }] }
    : {};

  const [positions, users] = await Promise.all([
    prisma.orgPosition.findMany({
      where: positionWhere,
      orderBy: [{ company: "asc" }, { order: "asc" }],
      select: {
        id: true,
        title: true,
        company: true,
        parentPositionId: true,
        assignedUserId: true,
        order: true,
      },
    }),
    prisma.user.findMany({
      where: { ...companyFilter },
      orderBy: [{ company: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        company: true,
        jobTitle: true,
      },
    }),
  ]);

  return NextResponse.json({ positions, users });
}

/**
 * POST — create a new position. Body: { title, company, parentPositionId? }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  try {
    const body = await req.json();
    const { title, company, parentPositionId } = body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    // MANAGERs can only create positions in their own company (not cross-company null)
    if (companyFilter.company && company !== companyFilter.company) {
      return NextResponse.json(
        { error: "You can only create positions in your own company" },
        { status: 403 }
      );
    }

    // Verify parent exists and is visible to this user
    if (parentPositionId) {
      const parent = await prisma.orgPosition.findUnique({
        where: { id: parentPositionId },
        select: { id: true, company: true },
      });
      if (!parent) {
        return NextResponse.json({ error: "Parent position not found" }, { status: 404 });
      }
      if (
        companyFilter.company &&
        parent.company !== null &&
        parent.company !== companyFilter.company
      ) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // Compute next order value among siblings
    const last = await prisma.orgPosition.findFirst({
      where: { parentPositionId: parentPositionId ?? null, company: company ?? null },
      orderBy: { order: "desc" },
    });

    const position = await prisma.orgPosition.create({
      data: {
        title: title.trim(),
        company: company ?? null,
        parentPositionId: parentPositionId ?? null,
        order: (last?.order ?? -1) + 1,
      },
    });

    return NextResponse.json(position, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create position";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
