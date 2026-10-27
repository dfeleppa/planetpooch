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

export async function AdminPeopleNav({ active }: { active: AdminPeopleView }) {
  const business = await getActiveBusiness();
  const visibleItems = adminPeopleNav.filter((item) =>
    business.company !== "GROOMING" || (item.view !== "scheduling" && item.view !== "guidelines"),
  );

  return (
    <nav className="pp-tabs" aria-label="Dashboard sections">
      {visibleItems.map((item) => (
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
