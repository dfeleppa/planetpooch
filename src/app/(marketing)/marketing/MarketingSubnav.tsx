"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const leadSources = [
  { value: "", label: "All" },
  { value: "meta", label: "Meta" },
  { value: "google-ads", label: "Google Ads" },
  { value: "google-lsa", label: "Google LSA" },
] as const;

export function MarketingSubnav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!pathname.startsWith("/marketing/ad-reporting")) return null;

  const sourceParam = searchParams.get("source") ?? "";
  const selectedSource = leadSources.some((source) => source.value === sourceParam)
    ? sourceParam
    : "";

  return (
    <div className="mb-6 border-b border-pp-line">
      <nav className="flex" aria-label="Lead source">
        {leadSources.map((source) => {
          const next = new URLSearchParams(searchParams.toString());
          if (source.value) next.set("source", source.value);
          else next.delete("source");
          const query = next.toString();
          const href = query ? `${pathname}?${query}` : pathname;
          const active = selectedSource === source.value;

          return (
            <Link
              key={source.label}
              href={href}
              className={cn("pp-tab", active && "is-on")}
              aria-current={active ? "page" : undefined}
            >
              {source.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
