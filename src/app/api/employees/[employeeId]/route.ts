import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

function isManagerOrAbove(role: string) {
  return role === "SUPER_ADMIN" || role === "MANAGER" || role === "ADMIN";
}

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
    select: { id: true, email: true, name: true, role: true, company: true, createdAt: true },
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
 * DELETE — hard-delete an employee. Related records cascade via schema.
 * Any org position the user held becomes vacant (assignedUserId → null).
 * A user cannot delete themselves.
 */
export async function DELETE(
  _req: NextRequest,
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

  if (employeeId === sessionUser.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, role: true, company: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  // Company-scope check for MANAGERs
  if (companyFilter.company && target.company !== companyFilter.company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Only SUPER_ADMIN can delete other admins/managers; MANAGER can only delete EMPLOYEEs
  if (sessionUser.role === "MANAGER" && target.role !== "EMPLOYEE") {
    return NextResponse.json(
      { error: "Managers can only delete employees" },
      { status: 403 }
    );
  }

  try {
    await prisma.user.delete({ where: { id: employeeId } });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete employee";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
