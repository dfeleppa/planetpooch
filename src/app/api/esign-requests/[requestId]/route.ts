import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

/**
 * PATCH — transition an eSign request. Body: { action: "mark_signed" | "cancel" }.
 *
 * `mark_signed` is the manual confirmation today; once we wire the real
 * Google eSignature webhook, that endpoint will perform the same status flip
 * and this action can be retired (or kept as an override).
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

  return NextResponse.json(
    { error: "Unknown action — expected 'mark_signed' or 'cancel'" },
    { status: 400 }
  );
}
