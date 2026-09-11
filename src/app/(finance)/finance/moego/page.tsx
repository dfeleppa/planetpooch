import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth-helpers";

export default async function MoegoPage() {
  await requireSuperAdmin();
  redirect("/finance/profit-loss#moego");
}
