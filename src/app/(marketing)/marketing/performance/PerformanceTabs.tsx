import Link from "next/link";

/**
 * Tab nav between the per-ad and per-script performance views. Server
 * component because both target pages are server components and there's
 * no client state to manage.
 */
export function PerformanceTabs({ active }: { active: "ads" | "scripts" }) {
  return (
    <nav
      className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 mb-4"
      aria-label="Performance view"
    >
      <Tab
        href="/marketing/performance"
        label="Ads"
        active={active === "ads"}
      />
      <Tab
        href="/marketing/performance/scripts"
        label="Scripts"
        active={active === "scripts"}
      />
    </nav>
  );
}

function Tab({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`px-3 py-1 text-sm rounded-md transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "text-gray-600 hover:bg-gray-100"
      }`}
    >
      {label}
    </Link>
  );
}
