import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { dateOrNull, vanDocumentSchema } from "@/lib/grooming-vans";
import { prisma } from "@/lib/prisma";
import { readVanDocument } from "@/lib/van-documents";

export async function POST(request: NextRequest, { params }: { params: Promise<{ number: string }> }) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isManagerOrAbove(session.user.role) || (await getActiveBusiness()).company !== "GROOMING")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const number = Number((await params).number);
  if (!Number.isSafeInteger(number) || number < 1) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  if (Number(request.headers.get("content-length") || 0) > 4_500_000)
    return NextResponse.json({ error: "Choose a file under 4 MB." }, { status: 413 });
  const form = await request.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Could not read the upload." }, { status: 400 });
  const file = form.get("document");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a document to upload." }, { status: 400 });
  let details: unknown;
  try { details = JSON.parse(String(form.get("details") || "null")); }
  catch { return NextResponse.json({ error: "Invalid document details." }, { status: 400 }); }
  const parsed = vanDocumentSchema.safeParse(details);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid document details." }, { status: 400 });
  let rawTitleFields: unknown;
  try { rawTitleFields = JSON.parse(String(form.get("titleFields") || "{}")); }
  catch { return NextResponse.json({ error: "Invalid title vehicle details." }, { status: 400 }); }
  const titleFields = z.object({
    year: z.number().int().min(1900).max(2100).optional(),
    make: z.string().trim().min(1).max(100).optional(),
    model: z.string().trim().min(1).max(100).optional(),
    vin: z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/).optional(),
  }).safeParse(rawTitleFields);
  if (!titleFields.success) return NextResponse.json({ error: "Check the title vehicle details before saving." }, { status: 400 });
  const vehicleDetails = titleFields.data;
  let document;
  try { document = await readVanDocument(file); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid document." }, { status: 400 }); }
  const van = await prisma.groomingVan.findUnique({ where: { number }, select: { id: true } });
  if (!van) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  const { issueDate, expiryDate, ...data } = parsed.data;
  try {
    const created = await prisma.$transaction(async transaction => {
      const saved = await transaction.groomingVanDocument.create({
        data: { ...data, vanId: van.id, issueDate: dateOrNull(issueDate), expiryDate: dateOrNull(expiryDate),
          fileName: document.name, mimeType: document.mimeType, fileSize: document.buffer.length,
          sha256: document.sha256, bytes: new Uint8Array(document.buffer) },
        select: { id: true },
      });
      if (data.category === "Title" && Object.keys(vehicleDetails).length)
        await transaction.groomingVan.update({ where: { id: van.id }, data: vehicleDetails });
      return saved;
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json({ error: "This file is already saved for this van." }, { status: 409 });
    throw error;
  }
}
