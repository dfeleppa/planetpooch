import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";

export default async function VanInsurancePage() {
  await requireAuth();
  if ((await getActiveBusiness()).company !== "GROOMING") redirect("/maintenance");
  redirect("/maintenance/vans?company=GROOMING");
}
