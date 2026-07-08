import { requireAuth, isManagerOrAbove } from "@/lib/auth-helpers";
import { ChecklistBoard } from "./ChecklistBoard";

export default async function DailyChecklistsPage() {
  const session = await requireAuth();
  const role = (session.user as { role?: string }).role;
  return <ChecklistBoard canEdit={isManagerOrAbove(role)} />;
}
