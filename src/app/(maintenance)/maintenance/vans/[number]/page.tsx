import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isManagerOrAbove, requireAuth } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { VanEditor } from "./VanEditor";
import { MaintenanceDocuments, VehicleDocuments } from "./VehicleDocuments";

export default async function VanPage({ params }: { params: Promise<{ number: string }> }) {
  await requireAuth();
  if ((await getActiveBusiness()).company !== "GROOMING") redirect("/maintenance");
  const number = Number((await params).number);
  if (!Number.isSafeInteger(number) || number < 1) notFound();
  const van = await prisma.groomingVan.findUnique({
    where: { number },
    include: { records: { orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }] },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, category: true, title: true, issueDate: true, expiryDate: true, notes: true, fileName: true } } },
  });
  if (!van) notFound();
  const session = await getServerSession(authOptions);
  const canEdit = isManagerOrAbove(session?.user?.role);
  const documents = van.documents.map(document => ({
    ...document, issueDate: document.issueDate?.toISOString().slice(0, 10) ?? null,
    expiryDate: document.expiryDate?.toISOString().slice(0, 10) ?? null,
  }));

  return (
    <div>
      <div className="mb-3 text-sm text-gray-500"><Link href="/maintenance/vans?company=GROOMING" className="hover:text-blue-600">Vans</Link> / Van {number}</div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Van {number}</h1>
        <p className="mt-1 text-gray-500">Vehicle profile, documents, and maintenance records</p>
      </div>
      <nav aria-label="Van pages" className="mb-5 flex gap-4 border-b border-gray-200 text-sm font-medium">
        <Link href="/maintenance/vans?company=GROOMING" className="pb-3 text-gray-500 hover:text-gray-900">Fleet</Link>
        <Link href="/maintenance/vans/insurance?company=GROOMING" className="pb-3 text-gray-500 hover:text-gray-900">Insurance</Link>
      </nav>
      <VehicleDocuments number={number} canEdit={canEdit} documents={documents} />
      <VanEditor
        key={`${van.updatedAt.toISOString()}-${van.year}-${van.make}-${van.model}-${van.vin}`}
        number={number}
        canEdit={canEdit}
        van={{
          year: van.year, make: van.make ?? "", model: van.model ?? "", vin: van.vin ?? "",
          licensePlate: van.licensePlate ?? "", mileage: van.mileage, status: van.status,
          registrationExpiry: van.registrationExpiry?.toISOString().slice(0, 10) ?? "",
          insuranceExpiry: van.insuranceExpiry?.toISOString().slice(0, 10) ?? "",
          insuranceCarrier: van.insuranceCarrier ?? "",
          insuranceDeductible: van.insuranceDeductible?.toString() ?? "",
          insurancePremium: van.insurancePremium?.toString() ?? "",
          inspectionExpiry: van.inspectionExpiry?.toISOString().slice(0, 10) ?? "", notes: van.notes,
        }}
        records={van.records.map((record) => ({
          id: record.id, serviceDate: record.serviceDate.toISOString().slice(0, 10), category: record.category,
          description: record.description, mileage: record.mileage, vendor: record.vendor,
          cost: record.cost?.toString() ?? null, nextDueDate: record.nextDueDate?.toISOString().slice(0, 10) ?? null,
          nextDueMileage: record.nextDueMileage, notes: record.notes,
          invoiceNumber: record.invoiceNumber, workOrderNumber: record.workOrderNumber,
          subtotal: record.subtotal?.toString() ?? null, tax: record.tax?.toString() ?? null,
          amountPaid: record.amountPaid?.toString() ?? null, balanceDue: record.balanceDue?.toString() ?? null,
          sourceFileName: record.sourceFileName,
        }))}
      />
      <MaintenanceDocuments number={number} canEdit={canEdit} documents={documents} />
    </div>
  );
}
