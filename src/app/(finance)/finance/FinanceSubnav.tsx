"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useBusiness } from "@/components/business/BusinessProvider";

type FinanceSection = {
  href: string;
  label: string;
  isActive: (pathname: string) => boolean;
};

const baseFinanceSections: FinanceSection[] = [
  {
    href: "/finance/profit-loss",
    label: "Profit & Loss",
    isActive: (pathname) =>
      pathname === "/finance" ||
      pathname.startsWith("/finance/profit-loss") ||
      pathname.startsWith("/finance/moego"),
  },
  {
    href: "/finance/kpis",
    label: "KPIs",
    isActive: (pathname) => pathname.startsWith("/finance/kpis"),
  },
];

export function FinanceSubnav() {
  const pathname = usePathname();
  const business = useBusiness();
  if (pathname.startsWith("/finance/payroll")) return null;
  const financeSections: FinanceSection[] = [
    ...baseFinanceSections,
    ...(business.company === "RESORT"
      ? [
          {
            href: "/finance/targets",
            label: "Targets",
            isActive: (currentPathname: string) =>
              currentPathname.startsWith("/finance/targets"),
          },
        ]
      : []),
  ];

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
