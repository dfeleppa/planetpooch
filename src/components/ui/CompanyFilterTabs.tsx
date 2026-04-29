import Link from "next/link";
import { Company } from "@prisma/client";

const TABS: { id: Company | "ALL"; label: string }[] = [
  { id: "GROOMING", label: "Mobile Grooming" },
  { id: "RESORT", label: "Pet Resort" },
  { id: "ALL", label: "All" },
];

export function CompanyFilterTabs({
  basePath,
  active,
  extraParams,
  hideAll,
}: {
  basePath: string;
  active: Company | "ALL";
  extraParams?: Record<string, string | undefined>;
  hideAll?: boolean;
}) {
  const buildHref = (id: Company | "ALL") => {
    const params = new URLSearchParams();
    if (id !== "ALL") params.set("company", id);
    for (const [k, v] of Object.entries(extraParams ?? {})) {
      if (v) params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const visibleTabs = hideAll ? TABS.filter((t) => t.id !== "ALL") : TABS;

  return (
    <div className="flex gap-2">
      {visibleTabs.map((tab) => (
        <Link
          key={tab.id}
          href={buildHref(tab.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            active === tab.id
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function resolveCompanyParam(value: string | undefined, fallback: Company): Company | "ALL" {
  if (value === "RESORT" || value === "GROOMING") return value;
  if (value === "ALL") return "ALL";
  return fallback;
}
