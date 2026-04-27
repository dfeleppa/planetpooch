import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

/**
 * POST — reactivate a terminated employee. Clears `terminatedAt`,
 * `terminationReason`, `terminatedById`. Does NOT auto-restore `managerId`
 * of former reports — those have already been reassigned and the new state
 * stands.
 *
 * Super admin only: re-granting login + portal access is a high-trust action.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { employeeId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, terminatedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (!target.terminatedAt) {
    return NextResponse.json(
      { error: "This employee is already active" },
      { status: 400 }
    );
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: {
      terminatedAt: null,
      terminationReason: null,
      terminatedById: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      company: true,
      terminatedAt: true,
    },
  });

  return NextResponse.json(updated);
}
