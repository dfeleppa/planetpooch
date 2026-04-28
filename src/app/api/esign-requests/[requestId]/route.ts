import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { deleteFile, isFileSigned, isStubId } from "@/lib/drive";
import { Company, Role } from "@prisma/client";

/**
 * PATCH — transition an eSign request.
 * Body: { action: "mark_signed" | "cancel" | "check_signature" | "delete_file" }.
 *
 * `check_signature` polls Drive on demand: if Workspace eSignature has
 * finalized (and locked) the file, we flip the row to SIGNED. Otherwise we
 * leave it as SENT and the client surfaces a "not signed yet" hint.
 *
 * `delete_file` is a follow-up to `cancel` — only valid on CANCELLED rows
 * with a tracked Drive file. Deletes the file from Drive and nulls the
 * `signedFileDriveId` so the row stops offering an "Open in Drive" link.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ requestId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const { requestId } = await params;

  const request = await prisma.esignRequest.findUnique({
    where: { id: requestId },
    include: {
      user: { select: { id: true, role: true, company: true } },
    },
  });
  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Manager-scope check: managers can only act on requests for employees in
  // their own company.
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  if (companyFilter.company && request.user.company !== companyFilter.company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let action: string;
  try {
    const body = await req.json();
    action = typeof body.action === "string" ? body.action : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (action === "mark_signed") {
    if (request.status !== "SENT") {
      return NextResponse.json(
        { error: `Cannot mark a ${request.status.toLowerCase()} request as signed` },
        { status: 400 }
      );
    }
    const updated = await prisma.esignRequest.update({
      where: { id: requestId },
      data: { status: "SIGNED", signedAt: new Date() },
      include: {
        signableDocument: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  }

  if (action === "check_signature") {
    if (request.status !== "SENT") {
      return NextResponse.json(
        { error: `Cannot check a ${request.status.toLowerCase()} request` },
        { status: 400 }
      );
    }
    if (!request.signedFileDriveId || isStubId(request.signedFileDriveId)) {
      return NextResponse.json(
        { error: "Request has no real Drive file to check" },
        { status: 400 }
      );
    }

    let signed: boolean;
    try {
      signed = await isFileSigned(request.signedFileDriveId);
    } catch (err) {
      console.error("[esign-requests.PATCH] check_signature failed:", err);
      return NextResponse.json(
        { error: "Failed to check signature status in Drive" },
        { status: 502 }
      );
    }

    const include = {
      signableDocument: { select: { id: true, name: true } },
      requestedBy: { select: { id: true, name: true } },
    };

    if (!signed) {
      const current = await prisma.esignRequest.findUnique({
        where: { id: requestId },
        include,
      });
      return NextResponse.json({ request: current, signatureDetected: false });
    }

    const updated = await prisma.esignRequest.update({
      where: { id: requestId },
      data: { status: "SIGNED", signedAt: new Date() },
      include,
    });
    return NextResponse.json({ request: updated, signatureDetected: true });
  }

  if (action === "cancel") {
    if (request.status !== "SENT") {
      return NextResponse.json(
        { error: `Cannot cancel a ${request.status.toLowerCase()} request` },
        { status: 400 }
      );
    }
    const updated = await prisma.esignRequest.update({
      where: { id: requestId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
      include: {
        signableDocument: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  }

  if (action === "delete_file") {
    if (request.status !== "CANCELLED") {
      return NextResponse.json(
        { error: "Can only delete the Drive file from a cancelled request" },
        { status: 400 }
      );
    }
    if (!request.signedFileDriveId) {
      return NextResponse.json(
        { error: "This request has no Drive file to delete" },
        { status: 400 }
      );
    }

    // Skip the Drive call for stub IDs (local dev) but still null the column
    // so the UI converges on the same final state.
    if (!isStubId(request.signedFileDriveId)) {
      try {
        await deleteFile(request.signedFileDriveId);
      } catch (err) {
        console.error("[esign-requests.PATCH] delete_file failed:", err);
        return NextResponse.json(
          { error: "Failed to delete the Drive file" },
          { status: 502 }
        );
      }
    }

    const updated = await prisma.esignRequest.update({
      where: { id: requestId },
      data: { signedFileDriveId: null },
      include: {
        signableDocument: { select: { id: true, name: true } },
        requestedBy: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json(updated);
  }

  return NextResponse.json(
    {
      error:
        "Unknown action — expected 'mark_signed', 'cancel', 'check_signature', or 'delete_file'",
    },
    { status: 400 }
  );
}
