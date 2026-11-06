"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { usePathname } from "next/navigation";

export function FinanceScreenHeader() {
  const pathname = usePathname();
  const title = pathname.startsWith("/finance/payroll") ? "Payroll" : "Metrics";

  return (
    <PageHeader className="pp-finance-screen-header mb-6" title={title}
      description={title === "Payroll" ? "Review weekly pay, reports, and payouts." : "Financial reporting and operating data for Planet Pooch."} />
  );
}
