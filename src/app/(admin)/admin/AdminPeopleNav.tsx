import Link from "next/link";
import { cn } from "@/lib/utils";

type AdminPeopleView =
  | "employees"
  | "scheduling"
  | "guidelines"
  | "org-chart";

const adminPeopleNav: { href: string; label: string; view: AdminPeopleView }[] = [
  { href: "/admin/employees", label: "Employees", view: "employees" },
  { href: "/admin/scheduling", label: "Scheduling", view: "scheduling" },
  { href: "/admin/scheduling/guidelines", label: "Guidelines", view: "guidelines" },
  { href: "/admin/org-chart", label: "Org Chart", view: "org-chart" },
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
