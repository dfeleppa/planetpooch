"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { DAY_PRESETS } from "@/lib/marketing/performance";

export function PerformanceFilters({
  days,
  campaign,
  campaigns,
}: {
  days: number;
  campaign: string;
  campaigns: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function update(patch: Record<string, string | undefined>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      <div
        className={cn(
          "inline-flex rounded-lg border border-gray-200 bg-white p-0.5",
          isPending && "opacity-60"
        )}
        role="group"
        aria-label="Date range"
      >
        {DAY_PRESETS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => update({ days: d === 30 ? undefined : String(d) })}
            className={cn(
              "px-3 py-1 text-sm rounded-md transition-colors",
              d === days
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            )}
            aria-pressed={d === days}
          >
            {d}d
          </button>
        ))}
      </div>

      <select
        value={campaign}
        onChange={(e) =>
          update({ campaign: e.target.value || undefined })
        }
        disabled={isPending}
        className={cn(
          "rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
          isPending && "opacity-60"
        )}
        aria-label="Filter by campaign"
      >
        <option value="">All campaigns ({campaigns.length})</option>
        {campaigns.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      {(campaign || days !== 30) && (
        <button
          type="button"
          onClick={() => update({ days: undefined, campaign: undefined })}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
