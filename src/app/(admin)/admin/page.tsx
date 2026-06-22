import { requireEmployeeManager } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";

export default async function AdminDashboardPage() {
  await requireEmployeeManager();
  redirect("/admin/employees");
}
