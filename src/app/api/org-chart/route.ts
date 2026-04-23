import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

function isManagerOrAbove(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "ADMIN";
}

/**
 * GET — returns all users the caller is allowed to see, flat list.
 * SUPER_ADMIN/ADMIN: everyone.
 * MANAGER: only their own company.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const users = await prisma.user.findMany({
    where: { ...companyFilter },
    orderBy: [{ company: "asc" }, { role: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      company: true,
      jobTitle: true,
      managerId: true,
    },
  });

  return NextResponse.json(users);
}

/**
 * PATCH — update a user's managerId (or clear it with null).
 * Body: { userId: string, managerId: string | null }
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  try {
    const { userId, managerId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    // Prevent self-management
    if (userId === managerId) {
      return NextResponse.json({ error: "A user cannot manage themselves" }, { status: 400 });
    }

    // Fetch the target user; scope to company for MANAGERs
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, company: true },
    });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    if (companyFilter.company && user.company !== companyFilter.company) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // If setting a manager, verify they exist and (for MANAGER callers) are in the same company
    if (managerId) {
      const mgr = await prisma.user.findUnique({
        where: { id: managerId },
        select: { id: true, company: true },
      });
      if (!mgr) {
        return NextResponse.json({ error: "Manager not found" }, { status: 404 });
      }
      if (companyFilter.company && mgr.company !== companyFilter.company) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }

      // Prevent cycles: walk up from proposed manager, fail if we hit userId
      let cursor: string | null = managerId;
      const seen = new Set<string>();
      while (cursor) {
        if (cursor === userId) {
          return NextResponse.json(
            { error: "That would create a reporting cycle" },
            { status: 400 }
          );
        }
        if (seen.has(cursor)) break;
        seen.add(cursor);
        const parent: { managerId: string | null } | null =
          await prisma.user.findUnique({
            where: { id: cursor },
            select: { managerId: true },
          });
        cursor = parent?.managerId ?? null;
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { managerId: managerId ?? null },
      select: { id: true, managerId: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update manager";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
