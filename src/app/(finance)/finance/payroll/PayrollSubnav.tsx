import Link from "next/link";
import { PAYROLL_BUSINESSES, type PayrollBusinessValue } from "@/lib/payroll";
import { cn } from "@/lib/utils";

export type PayrollSection = PayrollBusinessValue | "commissions";

const PAYROLL_BUSINESS_HREFS: Record<PayrollBusinessValue, string> = {
  "pet-resort": "/finance/payroll",
  "mobile-grooming": "/finance/payroll/mobile-grooming",
};

export function PayrollSubnav({ active }: { active: PayrollSection }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium text-gray-700">Business</p>
      <nav className="pp-tabs" aria-label="Payroll section">
        {PAYROLL_BUSINESSES.map((option) => {
          const isActive = active === option.value;
          return (
            <Link
              key={option.value}
              href={PAYROLL_BUSINESS_HREFS[option.value]}
              className={cn("pp-tab", isActive && "is-on")}
              aria-current={isActive ? "page" : undefined}
            >
              {option.label}
            </Link>
          );
        })}
        <Link
          href="/finance/payroll/commissions"
          className={cn("pp-tab", active === "commissions" && "is-on")}
          aria-current={active === "commissions" ? "page" : undefined}
        >
          Commissions
        </Link>
      </nav>
    </div>
  );
}
