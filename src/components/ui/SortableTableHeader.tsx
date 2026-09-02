"use client";

import { TableHeader } from "@/components/ui/Table";
import { cn } from "@/lib/utils";
import type { SortDirection } from "@/lib/table-sort";

export function SortableTableHeader<TKey extends string>({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: TKey;
  activeSortKey: TKey;
  direction: SortDirection;
  onSort: (sortKey: TKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === activeSortKey;

  return (
    <TableHeader
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : undefined
      }
      className={align === "right" ? "text-right" : undefined}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Sort by ${label}`}
        className={cn(
          "group inline-flex w-full items-center gap-1.5 transition-colors hover:text-gray-900",
          align === "right" ? "justify-end" : "justify-start",
          active && "text-gray-900"
        )}
      >
        <span>{label}</span>
        <span
          aria-hidden="true"
          className={cn("text-[11px]", active ? "opacity-100" : "opacity-35")}
        >
          {active ? (direction === "asc" ? "↑" : "↓") : "↕"}
        </span>
      </button>
    </TableHeader>
  );
}
