"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const sections = [
  {
    href: "/marketing/evaluate",
    label: "Evaluate Ads",
    active: (path: string) => path === "/marketing" || path.startsWith("/marketing/evaluate") || path.startsWith("/marketing/performance") || path.startsWith("/marketing/ad-reporting"),
  },
  {
    href: "/marketing/create",
    label: "Create Ads",
    active: (path: string) => path.startsWith("/marketing/create") || path.startsWith("/marketing/ideas") || path.startsWith("/marketing/scripts"),
  },
] as const;

export function MarketingSubnav() {
  const pathname = usePathname();
  const settingsActive = pathname.startsWith("/marketing/settings") || pathname.startsWith("/marketing/voice");
  return (
    <div className="mb-6 flex items-end justify-between border-b border-pp-line">
      <nav className="flex" aria-label="Marketing sections">
        {sections.map((section) => {
          const active = section.active(pathname);
          return <Link key={section.href} href={section.href} className={cn("pp-tab", active && "is-on")} aria-current={active ? "page" : undefined}>{section.label}</Link>;
        })}
      </nav>
      <Link href="/marketing/settings" className={cn("mb-2 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800", settingsActive && "bg-gray-100 font-medium text-gray-900")} aria-current={settingsActive ? "page" : undefined}>
        Settings
      </Link>
    </div>
  );
}
