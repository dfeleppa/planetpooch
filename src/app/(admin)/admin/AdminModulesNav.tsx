"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

type AdminModulesView = "manage" | "module-progress" | "audit-log";

const items: { href: string; label: string; view: AdminModulesView }[] = [
  { href: "/admin/modules", label: "Manage Modules", view: "manage" },
  { href: "/admin/module-progress", label: "Module Progress", view: "module-progress" },
  { href: "/admin/audit-log", label: "Audit Log", view: "audit-log" },
];

export function AdminModulesNav({ active }: { active: AdminModulesView }) {
  const { data: session } = useSession();
  const role = session?.user?.role;
  const canManageModules = role === "SUPER_ADMIN" || role === "ADMIN" || session?.user?.jobTitle === "CMO";

  return (
    <nav className="pp-tabs" aria-label="Modules sections">
      {items.filter((item) => item.view !== "manage" || canManageModules).map((item) => (
        <Link
          key={item.view}
          href={item.href}
          className={cn("pp-tab", active === item.view && "is-on")}
          aria-current={active === item.view ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
