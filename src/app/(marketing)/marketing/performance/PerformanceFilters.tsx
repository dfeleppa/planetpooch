"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { DAY_PRESETS } from "@/lib/marketing/performance-options";

export function PerformanceFilters({
  days,
  from,
  to,
  campaign,
  campaigns,
}: {
  days: number;
  from?: string;
  to?: string;
  campaign: string;
  campaigns: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [startDate, setStartDate] = useState(from ?? "");
  const [endDate, setEndDate] = useState(to ?? "");

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
            onClick={() => { setStartDate(""); setEndDate(""); update({ days: d === 30 ? undefined : String(d), from: undefined, to: undefined }); }}
            className={cn(
              "px-3 py-1 text-sm rounded-md transition-colors",
              !from && d === days
                ? "bg-blue-600 text-white"
                : "text-gray-600 hover:bg-gray-100"
            )}
            aria-pressed={!from && d === days}
          >
            {d}d
          </button>
        ))}
      </div>

      <form className="flex flex-wrap items-center gap-2" onSubmit={(event) => {
        event.preventDefault();
        if (startDate && endDate && startDate <= endDate) update({ from: startDate, to: endDate, days: undefined });
      }}>
        <label className="text-xs text-gray-600">From <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" required /></label>
        <label className="text-xs text-gray-600">To <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900" required /></label>
        <button type="submit" disabled={isPending || !startDate || !endDate || startDate > endDate} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50">Apply</button>
      </form>

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

      {(campaign || days !== 30 || from) && (
        <button
          type="button"
          onClick={() => { setStartDate(""); setEndDate(""); update({ days: undefined, from: undefined, to: undefined, campaign: undefined }); }}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}
