import { requireAuth } from "@/lib/auth-helpers";
import { DaycareSubnav } from "./DaycareSubnav";
import { getActiveBusiness } from "@/lib/business-server";
import { redirect } from "next/navigation";

export default async function DaycareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();
  if ((await getActiveBusiness()).company !== "RESORT") redirect("/maintenance");

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Daycare</h1>
        <p className="mt-1 text-gray-500">Operational reports from MoeGo</p>
      </div>
      <DaycareSubnav />
      {children}
    </div>
  );
}
