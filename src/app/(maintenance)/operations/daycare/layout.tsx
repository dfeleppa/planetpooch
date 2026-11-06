import { PageHeader } from "@/components/ui/PageHeader";
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
    <div className="min-w-0">
      <PageHeader title="Daycare Reports" description="Operational reports from MoeGo" className="mb-6" />
      <DaycareSubnav />
      {children}
    </div>
  );
}
