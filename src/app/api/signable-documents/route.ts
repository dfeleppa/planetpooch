import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove, isSuperAdmin } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const docs = await prisma.signableDocument.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      driveFileId: true,
    },
  });

  return NextResponse.json(docs);
}

/**
 * POST — register a new master document. Super admin only: the Drive file ID
 * has to be looked up out-of-band (right-click in Drive → Get link), and we
 * don't want managers minting random doc rows.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const driveFileId =
      typeof body.driveFileId === "string" ? body.driveFileId.trim() : "";
    const description =
      typeof body.description === "string" ? body.description.trim() : "";

    if (!name || !driveFileId) {
      return NextResponse.json(
        { error: "Name and Drive file ID are required" },
        { status: 400 }
      );
    }

    const doc = await prisma.signableDocument.create({
      data: { name, driveFileId, description },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
