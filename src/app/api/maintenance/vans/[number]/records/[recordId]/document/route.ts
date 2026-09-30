import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ number: string; recordId: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((await getActiveBusiness()).company !== "GROOMING")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { number: rawNumber, recordId } = await params;
  const number = Number(rawNumber);
  if (!Number.isSafeInteger(number) || number < 1) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const record = await prisma.groomingVanMaintenance.findFirst({
    where: { id: recordId, van: { number } },
    select: { sourceFileName: true, sourceMimeType: true, document: { select: { bytes: true } } },
  });
  if (!record?.document || !record.sourceMimeType) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const name = (record.sourceFileName || "maintenance-record").replace(/[\r\n"\\]/g, "_");
  return new Response(new Uint8Array(record.document.bytes), {
    headers: {
      "Content-Type": record.sourceMimeType,
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
