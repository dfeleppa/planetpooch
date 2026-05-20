import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { deleteFile, isStubId } from "@/lib/drive";
import { Company, Role } from "@prisma/client";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string; documentId: string }> }
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
  const { employeeId, documentId } = await params;

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

  const doc = await prisma.employeeDocument.findUnique({
    where: { id: documentId },
  });
  if (!doc || doc.userId !== employeeId) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  if (doc.driveFileId && !isStubId(doc.driveFileId)) {
    try {
      await deleteFile(doc.driveFileId);
    } catch (err) {
      console.error("[documents.DELETE] Drive file cleanup failed:", err);
      return NextResponse.json(
        { error: "Failed to delete the Drive file" },
        { status: 502 }
      );
    }
  }

  await prisma.employeeDocument.delete({ where: { id: documentId } });

  return NextResponse.json({ deleted: true });
}
