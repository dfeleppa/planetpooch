import { PageHeader } from "@/components/ui/PageHeader";
import { requireEmployeeManager } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { redirect } from "next/navigation";
import { AdminPeopleNav } from "../AdminPeopleNav";
import { ScheduleFormatter } from "./ScheduleFormatter";

export default async function SchedulingPage() {
  await requireEmployeeManager();
  const business = await getActiveBusiness();
  if (business.company === "GROOMING") redirect("/admin/employees");
  return (
    <div>
      <PageHeader title="Scheduling" description="Review and print weekly staffing coverage." className="pp-scheduling-page-header mb-6" />
      <AdminPeopleNav active="scheduling" />
      <ScheduleFormatter />
    </div>
  );
}
