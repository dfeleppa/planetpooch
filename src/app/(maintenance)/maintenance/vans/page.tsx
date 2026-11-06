import { PageHeader } from "@/components/ui/PageHeader";
import Link from "next/link";
import { VanSubnav } from "@/components/maintenance/VanSubnav";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { InsuranceDetails } from "./InsuranceDetails";
import { redirect } from "next/navigation";
import { isManagerOrAbove, requireAuth } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";

function dateLabel(date: Date | null) {
  return date ? date.toLocaleDateString("en-US", { timeZone: "UTC" }) : "—";
}

export default async function VansPage() {
  await requireAuth();
  const company = (await getActiveBusiness()).company;
  if (company !== "GROOMING") redirect("/maintenance");

  const vans = await prisma.groomingVan.findMany({
    orderBy: { number: "asc" },
    include: { records: { orderBy: [{ serviceDate: "desc" }, { createdAt: "desc" }], take: 1 } },
  });

  const session = await getServerSession(authOptions);
  const canEdit = isManagerOrAbove(session?.user?.role);
  const totalPremium = vans.reduce((total, van) => total + Math.round(Number(van.insurancePremium ?? 0) * 100), 0) / 100;

  return (
    <div>
      <PageHeader title="Vans" description="Mobile Grooming vehicle details, insurance, and maintenance history" className="mb-6" />
      <VanSubnav active="fleet" />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-gray-900">Fleet</h2>
        <p className="text-sm text-gray-600">Total insurance premiums <strong className="ml-2 text-gray-900">{totalPremium.toLocaleString("en-US", { style: "currency", currency: "USD" })}</strong></p>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="pp-sticky-first w-full min-w-[960px] divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-3">Van</th>
              <th scope="col" className="px-4 py-3">Vehicle</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Plate</th>
              <th scope="col" className="px-4 py-3">Mileage</th>
              <th scope="col" className="px-4 py-3">Last service</th>
              <th scope="col" className="px-4 py-3">Registration</th>
              <th scope="col" className="px-4 py-3">Insurance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vans.map((van) => (
              <tr key={van.id} className="align-top hover:bg-gray-50">
                <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                  <Link href={`/maintenance/vans/${van.number}`} className="text-blue-700 hover:underline">Van {van.number}</Link>
                </th>
                <td className="px-4 py-3 text-gray-900">{[van.year, van.make, van.model].filter(Boolean).join(" ") || "Vehicle details needed"}<details className="mt-1 text-xs text-pp-ink-3"><summary className="cursor-pointer">Vehicle details</summary><p className="mt-2">Engine {van.engine || "—"}</p><p className="mt-1 break-all">VIN: {van.vin ? van.vin.length === 4 ? `Last 4: ${van.vin}` : van.vin : "—"}</p></details></td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${van.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                    {van.status === "ACTIVE" ? "Active" : van.status === "IN_SERVICE" ? "In service" : "Out of service"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{van.licensePlate || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{van.mileage == null ? "—" : van.mileage.toLocaleString()}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{dateLabel(van.records[0]?.serviceDate ?? null)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{dateLabel(van.registrationExpiry)}</td>
                <td className="px-4 py-3">
                  <InsuranceDetails number={van.number} canEdit={canEdit} expiry={dateLabel(van.insuranceExpiry)} insurance={{
                    carrier: van.insuranceCarrier ?? "", deductible: van.insuranceDeductible?.toString() ?? "", premium: van.insurancePremium?.toString() ?? "",
                  }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {vans.length < 10 && <p className="mt-4 text-sm text-amber-700">Fleet records are incomplete. Expected at least 10 vans; found {vans.length}.</p>}
    </div>
  );
}
