import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove, isSuperAdmin } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

export async function GET(req: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const { employeeId } = await params;

  // For MANAGERs, verify the employee belongs to their company
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      email: true,
      name: true,
      firstName: true,
      lastName: true,
      role: true,
      company: true,
      createdAt: true,
    },
  });

  if (!employee || employee.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Company-scope check for MANAGERs
  if (companyFilter.company && employee.company !== companyFilter.company) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const modules = await prisma.module.findMany({
    orderBy: { order: "asc" },
    include: {
      subsections: {
        orderBy: { order: "asc" },
        include: {
          lessons: {
            orderBy: { order: "asc" },
            select: { id: true, title: true, order: true, estimatedMinutes: true },
          },
        },
      },
    },
  });

  const completions = await prisma.lessonCompletion.findMany({
    where: { userId: employeeId },
    select: { lessonId: true, isCompleted: true, completedAt: true },
  });

  const completionMap = new Map(completions.map((c) => [c.lessonId, c]));

  const auditLogs = await prisma.completionAuditLog.findMany({
    where: { userId: employeeId },
    orderBy: { timestamp: "desc" },
    take: 50,
    include: {
      lesson: { select: { title: true } },
    },
  });

  const moduleData = modules.map((mod) => {
    const subsections = mod.subsections.map((sub) => ({
      ...sub,
      lessons: sub.lessons.map((lesson) => {
        const comp = completionMap.get(lesson.id);
        return {
          ...lesson,
          isCompleted: comp?.isCompleted ?? false,
          completedAt: comp?.completedAt ?? null,
        };
      }),
    }));

    const allLessons = subsections.flatMap((s) => s.lessons);
    return {
      id: mod.id,
      title: mod.title,
      totalLessons: allLessons.length,
      completedLessons: allLessons.filter((l) => l.isCompleted).length,
      subsections,
    };
  });

  return NextResponse.json({
    employee,
    modules: moduleData,
    recentAuditLogs: auditLogs,
  });
}

/**
 * PATCH — update employee fields. Admin-side edit.
 * Body may include: name, email, phone, jobTitle, department, hireDate,
 * company, role. Company-scope enforced for MANAGERs. Only SUPER_ADMIN
 * can assign SUPER_ADMIN role; MANAGER can assign EMPLOYEE or MANAGER
 * (within their own company only).
 */
export async function PATCH(
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
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const { employeeId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, role: true, company: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (companyFilter.company && target.company !== companyFilter.company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // MANAGERs can only edit EMPLOYEE-role users
  if (sessionUser.role === "MANAGER" && target.role !== "EMPLOYEE") {
    return NextResponse.json(
      { error: "Managers can only edit employees" },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const data: Record<string, unknown> = {};

    // First/last name updates: either may be sent independently. Whenever one
    // changes, recompose `name` server-side using the existing values for the
    // other so all three columns stay consistent.
    const incomingFirst =
      typeof body.firstName === "string" ? body.firstName.trim() : null;
    const incomingLast =
      typeof body.lastName === "string" ? body.lastName.trim() : null;
    if (incomingFirst !== null || incomingLast !== null) {
      const current = await prisma.user.findUnique({
        where: { id: employeeId },
        select: { firstName: true, lastName: true },
      });
      if (!current) {
        return NextResponse.json({ error: "Employee not found" }, { status: 404 });
      }
      const nextFirst = incomingFirst || current.firstName;
      const nextLast = incomingLast || current.lastName;
      if (!nextFirst || !nextLast) {
        return NextResponse.json(
          { error: "First name and last name cannot be empty" },
          { status: 400 }
        );
      }
      data.firstName = nextFirst;
      data.lastName = nextLast;
      data.name = `${nextFirst} ${nextLast}`;
    } else if (typeof body.name === "string" && body.name.trim()) {
      // Legacy callers that still send a single `name` field — keep working.
      data.name = body.name.trim();
    }

    if ("email" in body) {
      const rawEmail = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (rawEmail && rawEmail !== target.email) {
        const existing = await prisma.user.findUnique({ where: { email: rawEmail } });
        if (existing && existing.id !== employeeId) {
          return NextResponse.json(
            { error: "A user with that email already exists" },
            { status: 400 }
          );
        }
        data.email = rawEmail;
      }
    }

    if ("phone" in body) data.phone = body.phone?.trim() || null;
    if ("jobTitle" in body) data.jobTitle = body.jobTitle?.trim() || null;
    if ("department" in body) data.department = body.department?.trim() || null;
    if ("hireDate" in body) data.hireDate = body.hireDate ? new Date(body.hireDate) : null;

    if ("company" in body && sessionUser.role !== "MANAGER") {
      // MANAGERs cannot change company. SUPER_ADMINs must pick one of the
      // three valid Company values — null is no longer permitted.
      const valid: Company[] = ["GROOMING", "RESORT", "CORPORATE"];
      if (!valid.includes(body.company)) {
        return NextResponse.json(
          { error: "Company must be Grooming, Resort, or Corporate" },
          { status: 400 }
        );
      }
      data.company = body.company;
    }

    if ("role" in body && body.role) {
      const desired = body.role as Role;
      const callerIsTopTier =
        sessionUser.role === "SUPER_ADMIN" ||
        sessionUser.role === "ADMIN";
      if (
        (desired === "SUPER_ADMIN" || desired === "MARKETING") &&
        !callerIsTopTier
      ) {
        return NextResponse.json(
          { error: "Only Super Admins can assign privileged roles" },
          { status: 403 }
        );
      }
      if (
        desired === "MANAGER" ||
        desired === "EMPLOYEE" ||
        desired === "SUPER_ADMIN" ||
        desired === "MARKETING"
      ) {
        data.role = desired;
      }
    }

    const updated = await prisma.user.update({
      where: { id: employeeId },
      data,
      select: {
        id: true,
        name: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        company: true,
        jobTitle: true,
        department: true,
        phone: true,
        hireDate: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE — permanently remove an employee row.
 *
 * This is the rare-escape-hatch path. Normal offboarding goes through
 * `POST /api/employees/[id]/end-employment`, which preserves the row and all
 * historical data. Hard delete is now restricted to:
 *   1. SUPER_ADMIN role (was MANAGER+ — behavior change).
 *   2. Targets that are already terminated (`terminatedAt != null`).
 *
 * The user's Drive folder is intentionally NOT deleted here. Folders are
 * preserved as part of the offboarding policy regardless of whether the DB
 * row stays. Do not "fix" this by adding a Drive cleanup call.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json(
      { error: "Only Super Admins can permanently delete employees" },
      { status: 403 }
    );
  }

  const sessionUser = session.user as { id: string; role: Role };
  const { employeeId } = await params;

  if (employeeId === sessionUser.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, role: true, company: true, terminatedAt: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (!target.terminatedAt) {
    return NextResponse.json(
      { error: "End this employee's employment before permanently deleting the record" },
      { status: 400 }
    );
  }

  try {
    await prisma.user.delete({ where: { id: employeeId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    // P2003 = foreign-key constraint violation. With the SetNull cleanup on
    // actor pointers (uploadedBy, createdBy, ownerId, etc.) this should be
    // rare, but surface a readable message instead of leaking the raw error.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return NextResponse.json(
        {
          error:
            "Cannot delete: this employee is still referenced by data that doesn't allow it (e.g. an unreassigned project or maintenance schedule). Reassign those records first.",
        },
        { status: 409 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to delete employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
