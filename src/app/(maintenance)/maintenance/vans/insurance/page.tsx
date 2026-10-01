import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isManagerOrAbove, requireAuth } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { InsuranceTable } from "./InsuranceTable";

export default async function VanInsurancePage() {
  await requireAuth();
  if ((await getActiveBusiness()).company !== "GROOMING") redirect("/maintenance");
  const [vans, session] = await Promise.all([
    prisma.groomingVan.findMany({ orderBy: { number: "asc" } }),
    getServerSession(authOptions),
  ]);
  return <div>
    <div className="mb-3 text-sm text-gray-500"><Link href="/maintenance/vans?company=GROOMING" className="hover:text-blue-600">Vans</Link> / Insurance</div>
    <h1 className="text-2xl font-bold text-gray-900">Van insurance</h1>
    <p className="mt-1 mb-6 text-gray-500">Insurance coverage details for the Mobile Grooming fleet</p>
    <nav aria-label="Van pages" className="mb-5 flex gap-4 border-b border-gray-200 text-sm font-medium">
      <Link href="/maintenance/vans?company=GROOMING" className="pb-3 text-gray-500 hover:text-gray-900">Fleet</Link>
      <span aria-current="page" className="border-b-2 border-pp-accent pb-3 text-pp-accent">Insurance</span>
    </nav>
    <InsuranceTable canEdit={isManagerOrAbove(session?.user?.role)} vans={vans.map(van => ({
      number: van.number, year: van.year, make: van.make ?? "", model: van.model ?? "", vin: van.vin ?? "",
      carrier: van.insuranceCarrier ?? "", deductible: van.insuranceDeductible?.toString() ?? "",
      premium: van.insurancePremium?.toString() ?? "",
    }))} />
    {vans.length < 10 && <p className="mt-4 text-sm text-amber-700">Fleet records are incomplete. Expected at least 10 vans; found {vans.length}.</p>}
  </div>;
}
