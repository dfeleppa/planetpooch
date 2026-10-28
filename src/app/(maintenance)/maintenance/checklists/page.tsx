import { requireAuth } from "@/lib/auth-helpers";
import { ChecklistBoard } from "./ChecklistBoard";
import { checklistDepartments, canEditChecklists } from "@/lib/checklist-access";
import { redirect } from "next/navigation";

export default async function DailyChecklistsPage() {
  const session = await requireAuth();
  const departments = checklistDepartments(session.user);
  if (!departments.length) redirect("/dashboard");
  return <ChecklistBoard departments={departments} canEdit={canEditChecklists(session.user)} />;
}
