import Link from "next/link";
import { cn } from "@/lib/utils";

const views = [
  { key: "fleet", label: "Fleet", href: "/maintenance/vans" },
  { key: "schedules", label: "Schedules", href: "/maintenance/schedules" },
  { key: "insurance", label: "Insurance", href: "/maintenance/vans/insurance" },
] as const;

export function VanSubnav({ active }: { active: (typeof views)[number]["key"] }) {
  return (
    <nav aria-label="Van pages" className="mb-5 flex gap-4 border-b border-gray-200 text-sm font-medium">
      {views.map((view) => (
        <Link key={view.key} href={`${view.href}?company=GROOMING`}
          aria-current={view.key === active ? "page" : undefined}
          className={cn("pb-3", view.key === active
            ? "border-b-2 border-pp-accent text-pp-accent"
            : "text-gray-500 hover:text-gray-900")}>
          {view.label}
        </Link>
      ))}
    </nav>
  );
}
