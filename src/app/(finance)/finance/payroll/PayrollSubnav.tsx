"use client";

import Link from "next/link";
import type { PayrollBusinessValue } from "@/lib/payroll";
import { cn } from "@/lib/utils";
import { useBusiness } from "@/components/business/BusinessProvider";

export type PayrollSection = PayrollBusinessValue | "commissions";

export function PayrollSubnav({ active }: { active: PayrollSection }) {
  const business = useBusiness();
  const payrollHref = business.company === "RESORT"
    ? "/finance/payroll"
    : "/finance/payroll/mobile-grooming";

  return (
    <nav className="pp-tabs" aria-label="Payroll sections">
      <Link
        href={payrollHref}
        className={cn("pp-tab", active !== "commissions" && "is-on")}
        aria-current={active !== "commissions" ? "page" : undefined}
      >
        Payroll
      </Link>
      {business.company === "RESORT" && (
        <Link
          href="/finance/payroll/commissions"
          className={cn("pp-tab", active === "commissions" && "is-on")}
          aria-current={active === "commissions" ? "page" : undefined}
        >
          Commissions
        </Link>
      )}
    </nav>
  );
}
