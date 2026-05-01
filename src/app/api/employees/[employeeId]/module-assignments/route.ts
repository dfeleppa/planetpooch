import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSession,
  isManagerOrAbove,
  getCompanyFilter,
} from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

async function loadEmployeeOrForbidden(employeeId: string) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const sessionUser = session.user as { role: Role; company: Company };
  const filter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, role: true, company: true },
  });

  if (!employee) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (filter.company && employee.company !== filter.company) {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }
  if (sessionUser.role === "MANAGER" && employee.role !== "EMPLOYEE") {
    return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  }

  return { employee };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  const result = await loadEmployeeOrForbidden(employeeId);
  if ("error" in result) return result.error;

  const assignments = await prisma.moduleUserAssignment.findMany({
    where: { userId: employeeId },
    select: {
      moduleId: true,
      assignedAt: true,
      module: { select: { id: true, title: true, icon: true } },
    },
    orderBy: { assignedAt: "desc" },
  });

  return NextResponse.json(
    assignments.map((a) => ({
      moduleId: a.moduleId,
      module: a.module,
      assignedAt: a.assignedAt,
    })),
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  const result = await loadEmployeeOrForbidden(employeeId);
  if ("error" in result) return result.error;

  const body = await req.json();
  const moduleId = typeof body?.moduleId === "string" ? body.moduleId : null;
  if (!moduleId) {
    return NextResponse.json({ error: "moduleId is required" }, { status: 400 });
  }

  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { id: true, title: true, icon: true },
  });
  if (!mod) {
    return NextResponse.json({ error: "Module not found" }, { status: 404 });
  }

  const assignment = await prisma.moduleUserAssignment.upsert({
    where: { moduleId_userId: { moduleId, userId: employeeId } },
    create: { moduleId, userId: employeeId },
    update: {},
    select: { moduleId: true, assignedAt: true },
  });

  return NextResponse.json(
    {
      moduleId: assignment.moduleId,
      module: mod,
      assignedAt: assignment.assignedAt,
    },
    { status: 201 },
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  const { employeeId } = await params;
  const result = await loadEmployeeOrForbidden(employeeId);
  if ("error" in result) return result.error;

  const moduleId = req.nextUrl.searchParams.get("moduleId");
  if (!moduleId) {
    return NextResponse.json({ error: "moduleId query param required" }, { status: 400 });
  }

  await prisma.moduleUserAssignment.deleteMany({
    where: { moduleId, userId: employeeId },
  });

  return NextResponse.json({ success: true });
}
