import Link from "next/link";
import { cn } from "@/lib/utils";
import { getActiveBusiness } from "@/lib/business-server";

type AdminPeopleView =
  | "employees"
  | "scheduling"
  | "guidelines";

const adminPeopleNav: { href: string; label: string; view: AdminPeopleView }[] = [
  { href: "/admin/employees", label: "Employees", view: "employees" },
  { href: "/admin/scheduling", label: "Scheduling", view: "scheduling" },
  { href: "/admin/scheduling/guidelines", label: "Guidelines", view: "guidelines" },
];

export async function AdminPeopleNav({ active, corporate = false }: { active: AdminPeopleView; corporate?: boolean }) {
  const business = await getActiveBusiness();
  const visibleItems = adminPeopleNav.filter((item) =>
    corporate ? item.view === "employees" : business.company !== "GROOMING" || item.view === "employees",
  );

  return (
    <nav className="pp-tabs" aria-label="Dashboard sections">
      {visibleItems.map((item) => (
        <Link
          key={item.view}
          href={corporate ? "/admin/people" : item.href}
          className={cn("pp-tab", active === item.view && "is-on")}
          aria-current={active === item.view ? "page" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
