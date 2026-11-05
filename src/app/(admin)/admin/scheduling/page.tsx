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
      <h1 className="text-2xl font-bold text-gray-900">Scheduling</h1>
      <p className="mt-1 mb-6 text-gray-500">Turn a weekly schedule into a one-page landscape staffing sheet.</p>
      <AdminPeopleNav active="scheduling" />
      <ScheduleFormatter />
    </div>
  );
}
