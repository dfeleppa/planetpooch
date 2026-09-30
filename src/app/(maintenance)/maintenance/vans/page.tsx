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
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {vans.map((van) => (
          <Link key={van.id} href={`/maintenance/vans/${van.number}`} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Van {van.number}</h2>
                <p className="text-sm text-gray-500">{[van.year, van.make, van.model].filter(Boolean).join(" ") || "Vehicle details needed"}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${van.status === "ACTIVE" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
                {van.status === "ACTIVE" ? "Active" : van.status === "IN_SERVICE" ? "In service" : "Out of service"}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-gray-500">Plate</dt><dd className="font-medium text-gray-900">{van.licensePlate || "—"}</dd></div>
              <div><dt className="text-gray-500">Mileage</dt><dd className="font-medium text-gray-900">{van.mileage == null ? "—" : van.mileage.toLocaleString()}</dd></div>
              <div><dt className="text-gray-500">Last service</dt><dd className="font-medium text-gray-900">{dateLabel(van.records[0]?.serviceDate ?? null)}</dd></div>
              <div><dt className="text-gray-500">Registration</dt><dd className="font-medium text-gray-900">{dateLabel(van.registrationExpiry)}</dd></div>
            </dl>
          </Link>
        ))}
      </div>
      {vans.length !== 10 && <p className="mt-4 text-sm text-amber-700">Fleet records are incomplete. Expected 10 vans; found {vans.length}.</p>}
    </div>
  );
}
