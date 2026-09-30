import { NextRequest, NextResponse } from "next/server";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { dateOrNull, vanRecordSchema } from "@/lib/grooming-vans";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { readVanDocument } from "@/lib/van-documents";

export async function POST(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(session.user.role) || (await getActiveBusiness()).company !== "GROOMING")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const number = Number((await params).number);
  if (!Number.isSafeInteger(number) || number < 1) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const isUpload = request.headers.get("content-type")?.startsWith("multipart/form-data") ?? false;
  if (isUpload && Number(request.headers.get("content-length") || 0) > 4_500_000)
    return NextResponse.json({ error: "Choose a file under 4 MB." }, { status: 413 });
  let payload: unknown;
  let file: File | null = null;
  if (isUpload) {
    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
    file = form.get("document") instanceof File ? form.get("document") as File : null;
    try { payload = JSON.parse(String(form.get("record") || "null")); }
    catch { return NextResponse.json({ error: "Invalid record details." }, { status: 400 }); }
  } else payload = await request.json().catch(() => null);
  const parsed = vanRecordSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid maintenance record" }, { status: 400 });
  if (isUpload && !file) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
  let document;
  try { document = file ? await readVanDocument(file) : null; }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid document" }, { status: 400 }); }
  const van = await prisma.groomingVan.findUnique({ where: { number }, select: { id: true } });
  if (!van) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  if (document && await prisma.groomingVanMaintenance.findFirst({ where: { vanId: van.id, sourceSha256: document.sha256 }, select: { id: true } }))
    return NextResponse.json({ error: "This document is already saved for this van." }, { status: 409 });
  const { serviceDate, nextDueDate, cost, ...details } = parsed.data;
  let created;
  try {
    created = await prisma.groomingVanMaintenance.create({
      data: {
        ...details, vanId: van.id, serviceDate: dateOrNull(serviceDate)!, nextDueDate: dateOrNull(nextDueDate), cost: cost || null,
        ...(document ? {
          sourceFileName: document.name, sourceMimeType: document.mimeType, sourceFileSize: document.buffer.length,
          sourceSha256: document.sha256, document: { create: { bytes: new Uint8Array(document.buffer) } },
        } : {}),
      },
      select: { id: true },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json({ error: "This document is already saved for this van." }, { status: 409 });
    throw error;
  }
  return NextResponse.json(created, { status: 201 });
}
