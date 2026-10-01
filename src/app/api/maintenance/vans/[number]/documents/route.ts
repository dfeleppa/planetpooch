import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { dateOrNull, vanDocumentSchema, vanRecordSchema } from "@/lib/grooming-vans";
import { prisma } from "@/lib/prisma";
import { readVanDocument } from "@/lib/van-documents";
import { extractVanDocument, VanDocumentExtractionError } from "@/lib/van-document-extraction";

const clean = (value: string | null, max: number) => value?.trim().slice(0, max) || "";
const validDate = (value: string | null) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : "";
};
const validMoney = (value: string | null) => value && /^\d{1,8}(\.\d{1,2})?$/.test(value) ? value : null;
const validMileage = (value: number | null) => value !== null && value >= 0 && value <= 10_000_000 ? value : "";
const maintenanceCategories = ["Routine service", "Oil change", "Tires", "Brakes", "Inspection", "Repair", "Other"];

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
  const category = vanDocumentSchema.shape.category.safeParse(form.get("category"));
  if (!category.success) return NextResponse.json({ error: "Choose a document type." }, { status: 400 });
  let document;
  try { document = await readVanDocument(file); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid document." }, { status: 400 }); }
  const van = await prisma.groomingVan.findUnique({
    where: { number }, select: { id: true, year: true, make: true, model: true, vin: true, licensePlate: true,
      registrationExpiry: true, insuranceExpiry: true, inspectionExpiry: true, insuranceCarrier: true,
      insuranceDeductible: true, insurancePremium: true },
  });
  if (!van) return NextResponse.json({ error: "Van not found" }, { status: 404 });
  if (await prisma.groomingVanDocument.findFirst({ where: { vanId: van.id, sha256: document.sha256 }, select: { id: true } }) ||
      await prisma.groomingVanMaintenance.findFirst({ where: { vanId: van.id, sourceSha256: document.sha256 }, select: { id: true } }))
    return NextResponse.json({ error: "This file is already saved for this van." }, { status: 409 });

  let extracted;
  try { extracted = await extractVanDocument(document, category.data); }
  catch (error) {
    if (error instanceof VanDocumentExtractionError)
      return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  if (!extracted.title && !extracted.issueDate && !extracted.expiryDate && !extracted.notes &&
      !extracted.vin && !extracted.licensePlate && !extracted.insuranceCarrier)
    return NextResponse.json({ error: "No readable document details were found. Try a clearer photo or PDF." }, { status: 422 });
  const issueDate = validDate(extracted.issueDate);
  const expiryDate = category.data === "Title" || category.data === "Maintenance" ? "" : validDate(extracted.expiryDate);
  const details = vanDocumentSchema.safeParse({
    category: category.data,
    title: clean(extracted.title, 200) || `${category.data} - ${document.name.replace(/\.[^.]+$/, "")}`.slice(0, 200),
    issueDate, expiryDate, notes: clean(extracted.notes, 2000),
  });
  if (!details.success) return NextResponse.json({ error: "Could not read valid document details. Try a clearer file." }, { status: 422 });

  const vin = clean(extracted.vin, 24).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const fullVin = /^[A-HJ-NPR-Z0-9]{17}$/.test(vin) ? vin : null;
  const existingVin = van.vin?.toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
  if (fullVin && existingVin && !fullVin.endsWith(existingVin))
    return NextResponse.json({ error: "The document VIN does not match this van. Nothing was saved." }, { status: 422 });

  const update: Prisma.GroomingVanUpdateInput = {};
  if (category.data === "Title" || category.data === "Registration") {
    if (!van.year && extracted.year && extracted.year >= 1900 && extracted.year <= 2100) update.year = extracted.year;
    if (!van.make && extracted.make) update.make = clean(extracted.make, 100);
    if (!van.model && extracted.model) update.model = clean(extracted.model, 100);
    if (fullVin && existingVin.length < 17) update.vin = fullVin;
    if (!van.licensePlate && extracted.licensePlate) update.licensePlate = clean(extracted.licensePlate, 30);
  }
  if (expiryDate) {
    const candidate = dateOrNull(expiryDate)!;
    if (category.data === "Registration" && (!van.registrationExpiry || candidate > van.registrationExpiry)) update.registrationExpiry = candidate;
    if (category.data === "Inspection" && (!van.inspectionExpiry || candidate > van.inspectionExpiry)) update.inspectionExpiry = candidate;
    if (category.data === "Insurance" && (!van.insuranceExpiry || candidate > van.insuranceExpiry)) update.insuranceExpiry = candidate;
  }
  if (category.data === "Insurance") {
    if (!van.insuranceCarrier && extracted.insuranceCarrier) update.insuranceCarrier = clean(extracted.insuranceCarrier, 200);
    const deductible = validMoney(extracted.insuranceDeductible);
    const premium = validMoney(extracted.insurancePremium);
    if (van.insuranceDeductible === null && deductible) update.insuranceDeductible = deductible;
    if (van.insurancePremium === null && premium) update.insurancePremium = premium;
  }

  const maintenance = category.data === "Maintenance" && issueDate && clean(extracted.workPerformed, 10000)
    ? vanRecordSchema.safeParse({
      serviceDate: issueDate,
      category: maintenanceCategories.includes(extracted.maintenanceCategory || "") ? extracted.maintenanceCategory : "Routine service",
      description: clean(extracted.workPerformed, 10000),
      mileage: validMileage(extracted.mileage), vendor: clean(extracted.vendor, 200),
      cost: validMoney(extracted.cost) || "", nextDueDate: validDate(extracted.nextDueDate),
      nextDueMileage: validMileage(extracted.nextDueMileage), notes: details.data.notes,
      invoiceNumber: clean(extracted.invoiceNumber, 100), workOrderNumber: clean(extracted.workOrderNumber, 100),
      subtotal: validMoney(extracted.subtotal) || "", tax: validMoney(extracted.tax) || "",
      amountPaid: validMoney(extracted.amountPaid) || "", balanceDue: validMoney(extracted.balanceDue) || "",
    })
    : null;
  const { issueDate: issued, expiryDate: expires, ...data } = details.data;
  try {
    const created = await prisma.$transaction(async transaction => {
      const saved = maintenance?.success
        ? await transaction.groomingVanMaintenance.create({
          data: {
            ...maintenance.data,
            vanId: van.id,
            serviceDate: dateOrNull(maintenance.data.serviceDate)!,
            nextDueDate: dateOrNull(maintenance.data.nextDueDate),
            cost: maintenance.data.cost || null,
            sourceFileName: document.name, sourceMimeType: document.mimeType,
            sourceFileSize: document.buffer.length, sourceSha256: document.sha256,
            document: { create: { bytes: new Uint8Array(document.buffer) } },
          },
          select: { id: true },
        })
        : await transaction.groomingVanDocument.create({
          data: { ...data, vanId: van.id, issueDate: dateOrNull(issued), expiryDate: dateOrNull(expires),
            fileName: document.name, mimeType: document.mimeType, fileSize: document.buffer.length,
            sha256: document.sha256, bytes: new Uint8Array(document.buffer) },
          select: { id: true },
        });
      if (Object.keys(update).length) await transaction.groomingVan.update({ where: { id: van.id }, data: update });
      return saved;
    });
    return NextResponse.json({ ...created, title: data.title, profileUpdated: Object.keys(update).length > 0,
      recordCreated: maintenance?.success ?? false }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return NextResponse.json({ error: "This file is already saved for this van." }, { status: 409 });
    throw error;
  }
}
