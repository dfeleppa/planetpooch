"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sections = [
  { href: "/operations/daycare/packages", label: "Packages" },
  { href: "/operations/daycare/not-active", label: "Not Active" },
  { href: "/operations/daycare/expired-packages", label: "Expired packages" },
] as const;

export function DaycareSubnav() {
  const pathname = usePathname();

  return (
    <nav className="pp-tabs mb-6" aria-label="Daycare reports">
      {sections.map((section) => {
        const active = pathname.startsWith(section.href);
        return (
          <Link
            key={section.href}
            href={section.href}
            className={cn("pp-tab", active && "is-on")}
            aria-current={active ? "page" : undefined}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
