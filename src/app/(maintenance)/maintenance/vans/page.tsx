import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
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

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Vans</h1>
        <p className="mt-1 text-gray-500">Mobile Grooming vehicle details and maintenance history</p>
      </div>
      <nav aria-label="Van pages" className="mb-5 flex gap-4 border-b border-gray-200 text-sm font-medium">
        <span aria-current="page" className="border-b-2 border-pp-accent pb-3 text-pp-accent">Fleet</span>
        <Link href="/maintenance/vans/insurance?company=GROOMING" className="pb-3 text-gray-500 hover:text-gray-900">Insurance</Link>
      </nav>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full min-w-[1000px] divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-gray-700">
            <tr>
              <th scope="col" className="px-4 py-3">Van</th>
              <th scope="col" className="px-4 py-3">Vehicle</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Plate</th>
              <th scope="col" className="px-4 py-3">VIN</th>
              <th scope="col" className="px-4 py-3">Mileage</th>
              <th scope="col" className="px-4 py-3">Last service</th>
              <th scope="col" className="px-4 py-3">Registration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {vans.map((van) => (
              <tr key={van.id} className="hover:bg-gray-50">
                <th scope="row" className="whitespace-nowrap px-4 py-3 text-left font-semibold">
                  <Link href={`/maintenance/vans/${van.number}`} className="text-blue-700 hover:underline">Van {van.number}</Link>
                </th>
                <td className="px-4 py-3 text-gray-900">{[van.year, van.make, van.model].filter(Boolean).join(" ") || "Vehicle details needed"}<div className="text-xs text-gray-500">Engine {van.engine || "—"}</div></td>
                <td className="whitespace-nowrap px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${van.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                    {van.status === "ACTIVE" ? "Active" : van.status === "IN_SERVICE" ? "In service" : "Out of service"}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{van.licensePlate || "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-900">{van.vin ? van.vin.length === 4 ? `Last 4: ${van.vin}` : van.vin : "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{van.mileage == null ? "—" : van.mileage.toLocaleString()}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{dateLabel(van.records[0]?.serviceDate ?? null)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-900">{dateLabel(van.registrationExpiry)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {vans.length < 10 && <p className="mt-4 text-sm text-amber-700">Fleet records are incomplete. Expected at least 10 vans; found {vans.length}.</p>}
    </div>
  );
}
