import { PayrollPageContent } from "../PayrollPageContent";
import { getActiveBusiness } from "@/lib/business-server";
import { redirect } from "next/navigation";

export default async function MobileGroomingPayrollPage() {
  if ((await getActiveBusiness()).company === "RESORT") redirect("/finance/payroll");
  return <PayrollPageContent business="mobile-grooming" />;
}
