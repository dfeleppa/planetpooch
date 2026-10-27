import { requireEmployeeManager } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";

export default async function CorporatePeopleLayout({ children }: { children: React.ReactNode }) {
  const session = await requireEmployeeManager();
  if (session.user.company !== "CORPORATE") redirect("/admin/employees");
  return children;
}
