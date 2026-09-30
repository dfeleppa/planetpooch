import Link from "next/link";
import { cn } from "@/lib/utils";
import { Company } from "@prisma/client";

type MaintenanceView = "dashboard" | "schedules" | "inventory";

const views: { key: MaintenanceView; label: string; href: string }[] = [
  { key: "dashboard", label: "Dashboard", href: "/maintenance" },
  { key: "schedules", label: "Schedules", href: "/maintenance/schedules" },
  { key: "inventory", label: "Inventory", href: "/maintenance/inventory" },
];

export function MaintenanceSubnav({ active, company }: { active: MaintenanceView; company: Company }) {
  return (
    <nav aria-label="Maintenance sections" className="mb-6 border-b border-gray-200">
      <div className="flex gap-5">
        {views.map((view) => {
          const isActive = view.key === active;
          return (
            <Link
              key={view.key}
              href={`${view.href}?company=${company}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "border-b-2 px-1 pb-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-pp-accent text-pp-accent"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
              )}
            >
              {view.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
