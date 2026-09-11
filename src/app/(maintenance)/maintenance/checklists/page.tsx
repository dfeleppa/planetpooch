import { requireAuth, isManagerOrAbove } from "@/lib/auth-helpers";
import { ChecklistBoard } from "./ChecklistBoard";
import { getActiveBusiness } from "@/lib/business-server";
import { redirect } from "next/navigation";

export default async function DailyChecklistsPage() {
  const session = await requireAuth();
  if ((await getActiveBusiness()).company !== "RESORT") redirect("/maintenance");
  const role = (session.user as { role?: string }).role;
  return <ChecklistBoard canEdit={isManagerOrAbove(role)} />;
}
