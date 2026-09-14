"use client";

import { usePathname } from "next/navigation";

export function FinanceScreenHeader() {
  const pathname = usePathname();
  const title = pathname.startsWith("/finance/payroll") ? "Payroll" : "Finance";

  return (
    <div className="pp-finance-screen-header mb-6">
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
      <p className="mt-1 text-gray-500">
        Financial reporting and operating data for Planet Pooch
      </p>
    </div>
  );
}
