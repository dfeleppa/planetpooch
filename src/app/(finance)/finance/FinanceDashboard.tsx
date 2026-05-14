"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

const BUSINESSES = [
  { value: "", label: "All Businesses" },
  { value: "mobile-grooming", label: "Planet Pooch Mobile Grooming" },
  { value: "pet-resort", label: "Planet Pooch Pet Resort" },
];

const DATE_RANGES = [
  { value: "mtd", label: "Month to Date" },
  { value: "last-month", label: "Last Month" },
  { value: "qtd", label: "Quarter to Date" },
  { value: "last-quarter", label: "Last Quarter" },
  { value: "ytd", label: "Year to Date" },
  { value: "last-year", label: "Last Year" },
  { value: "last-30", label: "Last 30 Days" },
  { value: "last-90", label: "Last 90 Days" },
  { value: "custom", label: "Custom Range" },
];

export function FinanceDashboard({
  business,
  range,
}: {
  business: string;
  range: string;
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

  const rangeLabel =
    DATE_RANGES.find((r) => r.value === range)?.label ?? "Month to Date";
  const businessLabel =
    BUSINESSES.find((b) => b.value === business)?.label ?? "All Businesses";

  return (
    <div className={cn(isPending && "opacity-60 pointer-events-none")}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-6">
        <select
          value={business}
          onChange={(e) =>
            update({ business: e.target.value || undefined })
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Filter by business"
        >
          {BUSINESSES.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>

        <select
          value={range}
          onChange={(e) =>
            update({ range: e.target.value === "mtd" ? undefined : e.target.value })
          }
          className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          aria-label="Date range"
        >
          {DATE_RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        {range === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={searchParams.get("from") ?? ""}
              onChange={(e) => update({ from: e.target.value || undefined })}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Start date"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="date"
              value={searchParams.get("to") ?? ""}
              onChange={(e) => update({ to: e.target.value || undefined })}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="End date"
            />
          </div>
        )}

        {(business || range !== "mtd") && (
          <button
            type="button"
            onClick={() =>
              update({
                business: undefined,
                range: undefined,
                from: undefined,
                to: undefined,
              })
            }
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold text-gray-300">&mdash;</p>
            <p className="text-sm font-medium text-gray-900 mt-2">
              Cost to Acquire a Customer
            </p>
            <p className="text-xs text-gray-500">CAC</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold text-gray-300">&mdash;</p>
            <p className="text-sm font-medium text-gray-900 mt-2">
              Long Term Value (Revenue)
            </p>
            <p className="text-xs text-gray-500">LTV &mdash; Revenue</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-6 text-center">
            <p className="text-3xl font-bold text-gray-300">&mdash;</p>
            <p className="text-sm font-medium text-gray-900 mt-2">
              Long Term Value (Profit)
            </p>
            <p className="text-xs text-gray-500">LTV &mdash; Profit</p>
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Showing {businessLabel} &middot; {rangeLabel}
      </p>
    </div>
  );
}
