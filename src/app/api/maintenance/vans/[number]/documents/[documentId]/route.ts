import { NextResponse } from "next/server";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";

type Context = { params: Promise<{ number: string; documentId: string }> };
type Access = { ok: true; number: number; documentId: string } | { ok: false; error: NextResponse };

async function authorize(context: Context, edit = false): Promise<Access> {
  const session = await getSession();
  if (!session?.user) return { ok: false, error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if ((edit && !isManagerOrAbove(session.user.role)) || (await getActiveBusiness()).company !== "GROOMING")
    return { ok: false, error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  const { number: rawNumber, documentId } = await context.params;
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number) || number < 1) return { ok: false, error: NextResponse.json({ error: "Van not found" }, { status: 404 }) };
  return { ok: true, number, documentId };
}

export async function GET(_request: Request, context: Context) {
  const access = await authorize(context);
  if (!access.ok) return access.error;
  const document = await prisma.groomingVanDocument.findFirst({
    where: { id: access.documentId, van: { number: access.number } },
    select: { bytes: true, fileName: true, mimeType: true },
  });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const name = document.fileName.replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(document.bytes), { headers: {
    "Content-Type": document.mimeType, "Content-Disposition": `inline; filename="${name}"`,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
  } });
}

export async function DELETE(_request: Request, context: Context) {
  const access = await authorize(context, true);
  if (!access.ok) return access.error;
  const removed = await prisma.groomingVanDocument.deleteMany({ where: { id: access.documentId, van: { number: access.number } } });
  if (!removed.count) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
