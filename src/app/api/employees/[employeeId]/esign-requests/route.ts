import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { copyFileToFolder, shareFileWithUser } from "@/lib/drive";
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
 * POST — send an eSign request. Body: { signableDocumentId }.
 *
 * Pipeline:
 *   1. Validate document + employee
 *   2. Copy master file → employee Drive folder
 *   3. Share copy with employee (writer access + email notification)
 *   4. Insert EsignRequest row with status=SENT
 *
 * If step 2 or 3 fails, we surface the error and do NOT create the row, so the
 * UI doesn't show a phantom "Sent" status. If the row creation fails after the
 * Drive copy succeeds we leave the file in place (admin can re-send; the copy
 * is harmless).
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
  if (!employee.driveFolderId) {
    return NextResponse.json(
      { error: "Employee has no Drive folder yet — re-create the employee record to provision one" },
      { status: 400 }
    );
  }
  if (employee.email.endsWith("@placeholder.local")) {
    return NextResponse.json(
      { error: "Employee has no real email on file — add one before sending an eSign request" },
      { status: 400 }
    );
  }

  let signableDocumentId: string;
  try {
    const body = await req.json();
    signableDocumentId =
      typeof body.signableDocumentId === "string" ? body.signableDocumentId : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!signableDocumentId) {
    return NextResponse.json(
      { error: "signableDocumentId is required" },
      { status: 400 }
    );
  }

  const doc = await prisma.signableDocument.findUnique({
    where: { id: signableDocumentId },
    select: { id: true, name: true, driveFileId: true, isActive: true },
  });
  if (!doc || !doc.isActive) {
    return NextResponse.json(
      { error: "Document not found or inactive" },
      { status: 404 }
    );
  }

  const fileName = `${doc.name} — ${employee.lastName}, ${employee.firstName}`;
  let copiedFileId: string;
  try {
    copiedFileId = await copyFileToFolder(
      doc.driveFileId,
      employee.driveFolderId,
      fileName
    );
  } catch (err) {
    console.error("[esign-requests.POST] copy failed:", err);
    return NextResponse.json(
      { error: "Failed to copy document to employee folder" },
      { status: 502 }
    );
  }

  try {
    await shareFileWithUser(
      copiedFileId,
      employee.email,
      `Please review and sign: ${doc.name}. Open in Google Drive and use the "Request signature" / signing tools to sign.`
    );
  } catch (err) {
    console.error("[esign-requests.POST] share failed:", err);
    return NextResponse.json(
      { error: "Failed to share file with employee" },
      { status: 502 }
    );
  }

  const created = await prisma.esignRequest.create({
    data: {
      userId: employee.id,
      signableDocumentId: doc.id,
      requestedById: sessionUser.id,
      signedFileDriveId: copiedFileId,
      status: "SENT",
    },
    include: {
      signableDocument: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
