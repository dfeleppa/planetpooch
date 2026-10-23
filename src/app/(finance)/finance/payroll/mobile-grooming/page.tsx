import { PayrollPageContent } from "../PayrollPageContent";
import { getActiveBusiness } from "@/lib/business-server";
import { redirect } from "next/navigation";

export default async function MobileGroomingPayrollPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view } = await searchParams;
  if ((await getActiveBusiness()).company === "RESORT" && view !== "payouts") redirect("/finance/payroll");
  return <PayrollPageContent business="mobile-grooming" startOnPayouts={view === "payouts"} />;
}
