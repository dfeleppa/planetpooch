import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isManagerOrAbove, requireAuth } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { MaintenanceSubnav } from "@/components/maintenance/MaintenanceSubnav";
import { VanEditor } from "./VanEditor";
import { VehicleDocuments } from "./VehicleDocuments";

export default async function VanPage({ params }: { params: Promise<{ number: string }> }) {
  await requireAuth();
  if ((await getActiveBusiness()).company !== "GROOMING") redirect("/maintenance");
  const number = Number((await params).number);
  if (!Number.isInteger(number) || number < 1 || number > 10) notFound();
  const van = await prisma.groomingVan.findUnique({
    where: { number },
    include: { records: { orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }] },
      documents: { orderBy: { createdAt: "desc" }, select: { id: true, category: true, title: true, issueDate: true, expiryDate: true, notes: true, fileName: true } } },
  });
  if (!van) notFound();
  const session = await getServerSession(authOptions);
  const canEdit = isManagerOrAbove(session?.user?.role);

  return (
    <div>
      <div className="mb-3 text-sm text-gray-500"><Link href="/maintenance/vans?company=GROOMING" className="hover:text-blue-600">Vans</Link> / Van {number}</div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Van {number}</h1>
        <p className="mt-1 text-gray-500">Vehicle profile, documents, and maintenance records</p>
      </div>
      <MaintenanceSubnav active="vans" company="GROOMING" />
      <VehicleDocuments number={number} canEdit={canEdit} documents={van.documents.map(document => ({
        ...document, issueDate: document.issueDate?.toISOString().slice(0, 10) ?? null,
        expiryDate: document.expiryDate?.toISOString().slice(0, 10) ?? null,
      }))} />
      <VanEditor
        key={`${van.updatedAt.toISOString()}-${van.year}-${van.make}-${van.model}-${van.vin}`}
        number={number}
        canEdit={canEdit}
        van={{
          year: van.year, make: van.make ?? "", model: van.model ?? "", vin: van.vin ?? "",
          licensePlate: van.licensePlate ?? "", mileage: van.mileage, status: van.status,
          registrationExpiry: van.registrationExpiry?.toISOString().slice(0, 10) ?? "",
          insuranceExpiry: van.insuranceExpiry?.toISOString().slice(0, 10) ?? "",
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
    </div>
  );
}
