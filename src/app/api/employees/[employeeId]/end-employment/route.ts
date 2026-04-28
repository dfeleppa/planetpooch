import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

/**
 * POST — end an employee's employment. Sets `terminatedAt`, `terminationReason`,
 * `terminatedById` on the user. Side effects (atomic):
 *   - Reassigns any direct reports to `replacementManagerId` (required if any).
 *   - Cancels SENT EsignRequests for this user. Drive copies are left in place.
 *   - OrgPosition assignments are NOT auto-cleared — the org chart UI flags
 *     terminated assignees so admins make an explicit succession decision.
 *
 * Body: { terminatedAt?: ISO, reason?: string, replacementManagerId?: string }
 *   - terminatedAt: defaults to now; back-dating allowed, future-dating rejected.
 *   - replacementManagerId: REQUIRED if the user has direct reports.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as {
    id: string;
    role: Role;
    company: Company | null;
  };
  const { employeeId } = await params;

  if (employeeId === sessionUser.id) {
    return NextResponse.json(
      { error: "You can't end your own employment" },
      { status: 400 }
    );
  }

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      role: true,
      company: true,
      terminatedAt: true,
      _count: { select: { reports: true } },
    },
  });
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  if (companyFilter.company && target.company !== companyFilter.company) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (sessionUser.role === "MANAGER" && target.role !== "EMPLOYEE") {
    return NextResponse.json(
      { error: "Managers can only end employment for employees" },
      { status: 403 }
    );
  }
  if (target.terminatedAt) {
    return NextResponse.json(
      { error: "This employee's employment has already ended" },
      { status: 400 }
    );
  }

  // Last top-tier admin guard — SUPER_ADMIN and DOS share the top tier, so
  // either one counts as "still admin" for the purpose of preventing lockout.
  // Never let the last top-tier user be terminated.
  if (target.role === "SUPER_ADMIN" || target.role === "DOS") {
    const remaining = await prisma.user.count({
      where: {
        role: { in: ["SUPER_ADMIN", "DOS"] },
        terminatedAt: null,
        id: { not: target.id },
      },
    });
    if (remaining === 0) {
      return NextResponse.json(
        { error: "Cannot terminate the last active Super Admin or DOS" },
        { status: 400 }
      );
    }
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Termination date — default now; reject future dates.
  let terminatedAt: Date;
  if (typeof body.terminatedAt === "string" && body.terminatedAt.trim()) {
    const parsed = new Date(body.terminatedAt);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: "Invalid terminatedAt date" },
        { status: 400 }
      );
    }
    if (parsed.getTime() > Date.now() + 60_000) {
      return NextResponse.json(
        { error: "Termination date cannot be in the future" },
        { status: 400 }
      );
    }
    terminatedAt = parsed;
  } else {
    terminatedAt = new Date();
  }

  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : null;

  // Replacement manager required if the target has reports.
  const replacementManagerId =
    typeof body.replacementManagerId === "string" && body.replacementManagerId.trim()
      ? body.replacementManagerId.trim()
      : null;

  if (target._count.reports > 0 && !replacementManagerId) {
    return NextResponse.json(
      {
        error: `This employee manages ${target._count.reports} ${
          target._count.reports === 1 ? "person" : "people"
        }. Pick a replacement manager before ending their employment.`,
        requiresReplacement: true,
        reportsCount: target._count.reports,
      },
      { status: 400 }
    );
  }

  if (replacementManagerId) {
    if (replacementManagerId === target.id) {
      return NextResponse.json(
        { error: "Replacement manager must be a different person" },
        { status: 400 }
      );
    }
    const replacement = await prisma.user.findUnique({
      where: { id: replacementManagerId },
      select: { id: true, terminatedAt: true, company: true, role: true },
    });
    if (!replacement || replacement.terminatedAt) {
      return NextResponse.json(
        { error: "Replacement manager must be an active user" },
        { status: 400 }
      );
    }
    if (
      sessionUser.role === "MANAGER" &&
      replacement.company !== sessionUser.company
    ) {
      return NextResponse.json(
        { error: "Replacement manager must be in your company" },
        { status: 400 }
      );
    }
  }

  // Atomic: terminate, reassign reports, cancel SENT eSign requests.
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id: target.id },
      data: {
        terminatedAt,
        terminationReason: reason,
        terminatedById: sessionUser.id,
      },
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        company: true,
        terminatedAt: true,
        terminationReason: true,
        terminatedById: true,
      },
    });

    if (replacementManagerId) {
      await tx.user.updateMany({
        where: { managerId: target.id },
        data: { managerId: replacementManagerId },
      });
    }

    await tx.esignRequest.updateMany({
      where: { userId: target.id, status: "SENT" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    return u;
  });

  return NextResponse.json(updated);
}
