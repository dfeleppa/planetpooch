"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

type FinanceSection = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const financeSections: FinanceSection[] = [
  {
    href: "/finance/profit-loss",
    label: "Profit & Loss",
    isActive: (pathname) =>
      pathname === "/finance" || pathname.startsWith("/finance/profit-loss"),
  },
  {
    href: "/finance/kpis",
    label: "KPIs",
    isActive: (pathname) => pathname.startsWith("/finance/kpis"),
  },
  {
    href: "/finance/data",
    label: "Data",
    isActive: (pathname) => pathname.startsWith("/finance/data"),
  },
  {
    href: "/finance/moego",
    label: "MoeGo",
    isActive: (pathname) => pathname.startsWith("/finance/moego"),
  },
  {
    href: "/finance/payroll",
    label: "Payroll",
    isActive: (pathname) => pathname.startsWith("/finance/payroll"),
  },
];

export function FinanceSubnav() {
  const pathname = usePathname();

  return (
    <nav className="pp-tabs mb-6" aria-label="Finance sections">
      {financeSections.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn("pp-tab", active && "is-on")}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
