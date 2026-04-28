import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { isFileSigned, isStubId } from "@/lib/drive";
import { Company, Role } from "@prisma/client";

/**
 * POST — batch-check every SENT eSign request in the caller's scope against
 * Drive, flipping any that Workspace eSignature has finalized to SIGNED.
 *
 * Scope: managers see only their own company's pending; admins/super-admins
 * see all. Stub-mode rows (no real Drive file) are skipped, not failed.
 *
 * Sequential by design — at 20–50 employees the total request count is small
 * and we'd rather not risk Drive rate-limiting via parallel bursts.
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const pending = await prisma.esignRequest.findMany({
    where: {
      status: "SENT",
      ...(companyFilter.company
        ? { user: { company: companyFilter.company } }
        : {}),
    },
    select: {
      id: true,
      signedFileDriveId: true,
      user: { select: { firstName: true, lastName: true } },
      signableDocument: { select: { name: true } },
    },
  });

  let checked = 0;
  let signedCount = 0;
  let failed = 0;
  const newlySigned: { employee: string; document: string }[] = [];

  for (const req of pending) {
    if (!req.signedFileDriveId || isStubId(req.signedFileDriveId)) continue;
    checked++;
    try {
      const signed = await isFileSigned(req.signedFileDriveId);
      if (!signed) continue;
      await prisma.esignRequest.update({
        where: { id: req.id },
        data: { status: "SIGNED", signedAt: new Date() },
      });
      signedCount++;
      newlySigned.push({
        employee: `${req.user.firstName} ${req.user.lastName}`,
        document: req.signableDocument.name,
      });
    } catch (err) {
      console.error("[esign-requests.check-pending] failed for", req.id, err);
      failed++;
    }
  }

  return NextResponse.json({
    total: pending.length,
    checked,
    signed: signedCount,
    failed,
    newlySigned,
  });
}
