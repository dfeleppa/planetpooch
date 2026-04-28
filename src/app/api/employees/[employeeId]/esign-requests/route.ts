import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { fileExists, parseDriveFileId } from "@/lib/drive";
import { Company, Role } from "@prisma/client";

/**
 * Returns the employee record after enforcing manager-scope rules. Returns
 * null if the caller can't access this employee (treat as 404 to avoid
 * leaking existence across companies).
 */
async function loadEmployeeForCaller(
  employeeId: string,
  callerRole: Role,
  callerCompany: Company | null
) {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      company: true,
      driveFolderId: true,
      terminatedAt: true,
    },
  });
  if (!employee) return null;

  const companyFilter = getCompanyFilter(callerRole, callerCompany);
  if (companyFilter.company && employee.company !== companyFilter.company) {
    return null;
  }
  if (callerRole === "MANAGER" && employee.role !== "EMPLOYEE") return null;
  return employee;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const { employeeId } = await params;
  const employee = await loadEmployeeForCaller(
    employeeId,
    sessionUser.role,
    sessionUser.company
  );
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const requests = await prisma.esignRequest.findMany({
    where: { userId: employeeId },
    orderBy: { createdAt: "desc" },
    include: {
      signableDocument: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(requests);
}

/**
 * POST — register an eSign request for a Drive file the admin has already
 * created. Body: { signableDocumentId, driveFileRef }.
 *
 * `driveFileRef` may be a raw Drive file ID or any Drive/Docs URL containing
 * one — `parseDriveFileId` normalizes both. We verify the file is reachable
 * by the service account before persisting so a typo or unshared file fails
 * fast at registration instead of silently never confirming.
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

  const employee = await loadEmployeeForCaller(
    employeeId,
    sessionUser.role,
    sessionUser.company
  );
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (employee.terminatedAt) {
    return NextResponse.json(
      { error: "Cannot send eSign requests to past employees" },
      { status: 400 }
    );
  }
  if (employee.email.endsWith("@placeholder.local")) {
    return NextResponse.json(
      { error: "Employee has no real email on file — add one before registering an eSign request" },
      { status: 400 }
    );
  }

  let signableDocumentId: string;
  let driveFileRef: string;
  try {
    const body = await req.json();
    signableDocumentId =
      typeof body.signableDocumentId === "string" ? body.signableDocumentId : "";
    driveFileRef =
      typeof body.driveFileRef === "string" ? body.driveFileRef : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!signableDocumentId) {
    return NextResponse.json(
      { error: "signableDocumentId is required" },
      { status: 400 }
    );
  }
  if (!driveFileRef.trim()) {
    return NextResponse.json(
      { error: "driveFileRef is required — paste the Drive file URL or ID" },
      { status: 400 }
    );
  }

  const driveFileId = parseDriveFileId(driveFileRef);
  if (!driveFileId) {
    return NextResponse.json(
      { error: "Couldn't parse a Drive file ID from that input" },
      { status: 400 }
    );
  }

  const doc = await prisma.signableDocument.findUnique({
    where: { id: signableDocumentId },
    select: { id: true, isActive: true },
  });
  if (!doc || !doc.isActive) {
    return NextResponse.json(
      { error: "Document not found or inactive" },
      { status: 404 }
    );
  }

  const exists = await fileExists(driveFileId);
  if (!exists) {
    return NextResponse.json(
      { error: "Drive file not found, or not shared with the service account" },
      { status: 400 }
    );
  }

  const created = await prisma.esignRequest.create({
    data: {
      userId: employee.id,
      signableDocumentId: doc.id,
      requestedById: sessionUser.id,
      signedFileDriveId: driveFileId,
      status: "SENT",
    },
    include: {
      signableDocument: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
