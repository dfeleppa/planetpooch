import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { uploadToFolder } from "@/lib/drive";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  buildDriveFileName,
  isValidCategory,
} from "@/lib/employee-documents";
import { Company, Role } from "@prisma/client";

async function loadEmployeeForCaller(
  employeeId: string,
  callerId: string,
  callerRole: Role,
  callerCompany: Company | null
) {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      role: true,
      company: true,
      driveFolderId: true,
      terminatedAt: true,
    },
  });
  if (!employee) return null;

  // Self-access: an employee can read / upload their own documents.
  if (employee.id === callerId) return employee;

  if (!isManagerOrAbove(callerRole)) return null;

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
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as {
    id: string;
    role: Role;
    company: Company | null;
  };
  const { employeeId } = await params;
  const employee = await loadEmployeeForCaller(
    employeeId,
    sessionUser.id,
    sessionUser.role,
    sessionUser.company
  );
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }

  const docs = await prisma.employeeDocument.findMany({
    where: { userId: employeeId },
    orderBy: { uploadedAt: "desc" },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(docs);
}

/**
 * POST — multipart/form-data upload. Fields:
 *   file:        the file blob
 *   category:    'I9' | 'ID_CARD' | 'SS_CARD' | 'OTHER'
 *   customName:  string (required when category=OTHER)
 *
 * Pipeline:
 *   1. Validate caller, employee scope, file metadata, category payload
 *   2. Stream file → Drive (employee folder) via uploadToFolder
 *   3. Insert EmployeeDocument row, return it
 *
 * If the Drive upload fails we surface the error and don't insert a row.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionUser = session.user as {
    id: string;
    role: Role;
    company: Company | null;
  };
  const { employeeId } = await params;

  const employee = await loadEmployeeForCaller(
    employeeId,
    sessionUser.id,
    sessionUser.role,
    sessionUser.company
  );
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (employee.terminatedAt) {
    return NextResponse.json(
      { error: "Cannot upload documents for past employees" },
      { status: 400 }
    );
  }
  if (!employee.driveFolderId) {
    return NextResponse.json(
      { error: "Employee has no Drive folder yet — create one first" },
      { status: 400 }
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart body" },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  const category = formData.get("category");
  const customNameRaw = formData.get("customName");

  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "file is required" },
      { status: 400 }
    );
  }
  if (!isValidCategory(category)) {
    return NextResponse.json(
      { error: "Invalid category" },
      { status: 400 }
    );
  }

  const customName =
    typeof customNameRaw === "string" ? customNameRaw.trim() : null;
  if (category === "OTHER" && !customName) {
    return NextResponse.json(
      { error: "A name is required for 'Other' uploads" },
      { status: 400 }
    );
  }

  if (file.size === 0) {
    return NextResponse.json({ error: "File is empty" }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: "File is too large (max 10 MB)" },
      { status: 413 }
    );
  }
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type || "unknown"}` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const driveFileName = buildDriveFileName(
    category,
    category === "OTHER" ? customName : null,
    file.name
  );

  let driveFileId: string;
  try {
    driveFileId = await uploadToFolder(
      employee.driveFolderId,
      buffer,
      driveFileName,
      file.type
    );
  } catch (err) {
    console.error("[documents.POST] Drive upload failed:", err);
    return NextResponse.json(
      { error: "Failed to upload to Drive" },
      { status: 502 }
    );
  }

  const created = await prisma.employeeDocument.create({
    data: {
      userId: employee.id,
      category,
      customName: category === "OTHER" ? customName : null,
      fileName: file.name,
      driveFileId,
      mimeType: file.type,
      fileSize: file.size,
      uploadedById: sessionUser.id,
    },
    include: {
      uploadedBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(created, { status: 201 });
}
