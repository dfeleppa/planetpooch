import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { isValidCategory } from "@/lib/employee-documents";
import { Company, Role } from "@prisma/client";

export async function PUT(
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

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, company: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  if (companyFilter.company && employee.company !== companyFilter.company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let category: string, note: string;
  try {
    const body = await req.json();
    category = body.category;
    note = typeof body.note === "string" ? body.note.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidCategory(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }
  if (!note) {
    return NextResponse.json({ error: "Note is required" }, { status: 400 });
  }

  const issue = await prisma.employeeDocumentIssue.upsert({
    where: { userId_category: { userId: employeeId, category } },
    create: {
      userId: employeeId,
      category,
      note,
      flaggedById: sessionUser.id,
    },
    update: {
      note,
      flaggedById: sessionUser.id,
    },
    include: {
      flaggedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(issue);
}

export async function DELETE(
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

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, company: true },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  if (companyFilter.company && employee.company !== companyFilter.company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  if (!isValidCategory(category)) {
    return NextResponse.json({ error: "Invalid category" }, { status: 400 });
  }

  await prisma.employeeDocumentIssue.deleteMany({
    where: { userId: employeeId, category },
  });

  return NextResponse.json({ resolved: true });
}
