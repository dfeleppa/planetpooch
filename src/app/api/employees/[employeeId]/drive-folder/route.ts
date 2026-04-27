import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { createEmployeeFolder, getFileWebLink } from "@/lib/drive";
import { Company, Role } from "@prisma/client";

/**
 * POST — create a Google Drive folder for an existing employee that doesn't
 * have one yet. Idempotent: if the employee already has `driveFolderId`, the
 * existing ID + link is returned with 200 (no new folder created).
 *
 * The original folder-creation happens in `POST /api/employees`, but that
 * call can fail (WIF misconfigured, transient Drive error) — in which case
 * the user is created without a folder. This endpoint is the backfill.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  const { employeeId } = await params;

  const employee = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
      company: true,
      driveFolderId: true,
    },
  });
  if (!employee) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (companyFilter.company && employee.company !== companyFilter.company) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (sessionUser.role === "MANAGER" && employee.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (employee.driveFolderId) {
    const webViewLink = await getFileWebLink(employee.driveFolderId);
    return NextResponse.json({
      driveFolderId: employee.driveFolderId,
      webViewLink,
      created: false,
    });
  }

  let folderId: string;
  try {
    const folderName = `${employee.lastName}, ${employee.firstName}`;
    folderId = await createEmployeeFolder(folderName, employee.company);
  } catch (err) {
    console.error("[drive-folder.POST] createEmployeeFolder failed:", err);
    return NextResponse.json(
      { error: "Failed to create Drive folder" },
      { status: 502 }
    );
  }

  await prisma.user.update({
    where: { id: employee.id },
    data: { driveFolderId: folderId },
  });

  const webViewLink = await getFileWebLink(folderId);
  return NextResponse.json(
    { driveFolderId: folderId, webViewLink, created: true },
    { status: 201 }
  );
}
