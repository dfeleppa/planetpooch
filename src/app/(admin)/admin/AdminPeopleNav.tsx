import Link from "next/link";
import { cn } from "@/lib/utils";

type AdminPeopleView = "employees" | "module-progress" | "org-chart" | "audit-log";

const adminPeopleNav: { href: string; label: string; view: AdminPeopleView }[] = [
  { href: "/admin/employees", label: "Employees", view: "employees" },
  { href: "/admin/module-progress", label: "Module Progress", view: "module-progress" },
  { href: "/admin/org-chart", label: "Org Chart", view: "org-chart" },
  { href: "/admin/audit-log", label: "Audit Log", view: "audit-log" },
];

export function AdminPeopleNav({ active }: { active: AdminPeopleView }) {
  return (
    <nav className="pp-tabs" aria-label="Dashboard sections">
      {adminPeopleNav.map((item) => (
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
