"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type CustomerRow = {
  moegoId: string;
  name: string | null;
  email: string | null;
  mainPhoneNumber: string | null;
  leadSource: string | null;
  preferredBusinessId: string | null;
  lastAppointmentDate: string | null;
  tags: string[];
  createdTime: string;
  orderCount: number;
  revenueCents: number;
  lastOrderTime: string | null;
};

type Sort =
  | "name"
  | "leadSource"
  | "created"
  | "orders"
  | "ltv"
  | "lastOrder";
type Dir = "asc" | "desc";

type ApiResponse = {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: Sort;
  dir: Dir;
};

/**
 * Default direction per column — picked so the first click on a header
 * does the obvious thing. Re-clicking the active column flips the
 * direction.
 */
const DEFAULT_DIR: Record<Sort, Dir> = {
  name: "asc",
  leadSource: "asc",
  created: "desc",
  orders: "desc",
  ltv: "desc",
  lastOrder: "desc",
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function CustomersTable() {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<Sort>("ltv");
  const [dir, setDir] = useState<Dir>("desc");
  /// `search` is the live input; `debounced` lags 300ms behind so we
  /// don't fire a query on every keystroke.
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Reset to page 1 whenever the filter / sort changes; otherwise a user
  // on page 5 of one filter sees an empty page after switching.
  useEffect(() => {
    setPage(1);
  }, [debounced, sort, dir]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        sort,
        dir,
      });
      if (debounced) params.set("search", debounced);
      const res = await fetch(
        `/api/finance/moego/customers?${params.toString()}`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setData((await res.json()) as ApiResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers");
    } finally {
      setLoading(false);
    }
  }, [page, sort, dir, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Click handler for column headers: first click on a column sorts
   * by that column with its default direction; clicking the active
   * column flips between asc and desc.
   */
  function toggleSort(col: Sort) {
    if (sort === col) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(col);
      setDir(DEFAULT_DIR[col]);
    }
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Customers</h2>
            <p className="text-xs text-gray-500 mt-1">
              One row per MoeGo customer. LTV is sum of paidAmount across all
              their orders. Click a column header to sort.
            </p>
          </div>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone…"
            className="w-56"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        {loading && !data ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            {debounced ? "No customers match this search." : "No customers yet."}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    <SortHeader
                      col="name"
                      label="Name"
                      sort={sort}
                      dir={dir}
                      onClick={toggleSort}
                    />
                    <th className="py-2 font-medium">Contact</th>
                    <SortHeader
                      col="leadSource"
                      label="Lead source"
                      sort={sort}
                      dir={dir}
                      onClick={toggleSort}
                    />
                    <th className="py-2 font-medium">Tags</th>
                    <SortHeader
                      col="created"
                      label="Acquired"
                      sort={sort}
                      dir={dir}
                      onClick={toggleSort}
                    />
                    <SortHeader
                      col="orders"
                      label="Orders"
                      sort={sort}
                      dir={dir}
                      onClick={toggleSort}
                      align="right"
                    />
                    <SortHeader
                      col="ltv"
                      label="LTV"
                      sort={sort}
                      dir={dir}
                      onClick={toggleSort}
                      align="right"
                    />
                    <SortHeader
                      col="lastOrder"
                      label="Last order"
                      sort={sort}
                      dir={dir}
                      onClick={toggleSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => (
                    <tr
                      key={r.moegoId}
                      className="border-b border-gray-100 last:border-b-0 hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        window.location.href = `/finance/moego/customers/${encodeURIComponent(r.moegoId)}`;
                      }}
                    >
                      <td className="py-2 text-gray-900">
                        <Link
                          href={`/finance/moego/customers/${encodeURIComponent(r.moegoId)}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-blue-600 hover:underline"
                        >
                          {r.name ?? <span className="text-gray-400">—</span>}
                        </Link>
                      </td>
                      <td className="py-2 text-gray-700">
                        <div className="text-xs">
                          {r.mainPhoneNumber && <div>{r.mainPhoneNumber}</div>}
                          {r.email && (
                            <div className="text-gray-500">{r.email}</div>
                          )}
                          {!r.mainPhoneNumber && !r.email && "—"}
                        </div>
                      </td>
                      <td className="py-2 text-gray-700 text-xs">
                        {r.leadSource ?? (
                          <span className="text-gray-400">unattributed</span>
                        )}
                      </td>
                      <td className="py-2 text-xs">
                        {r.tags.length === 0 ? (
                          <span className="text-gray-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {r.tags.slice(0, 3).map((t) => (
                              <span
                                key={t}
                                className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700"
                              >
                                {t}
                              </span>
                            ))}
                            {r.tags.length > 3 && (
                              <span className="text-gray-500">
                                +{r.tags.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-gray-700 text-xs">
                        {shortDate(r.createdTime)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900">
                        {r.orderCount}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900 font-medium">
                        {dollars(r.revenueCents)}
                      </td>
                      <td className="py-2 text-gray-700 text-xs">
                        {shortDate(r.lastOrderTime)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4 text-xs text-gray-600">
              <span>
                {data.total.toLocaleString()} customer
                {data.total === 1 ? "" : "s"} · page {data.page} of {totalPages}
              </span>
              <div className="flex gap-1">
                <button
                  className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page <= 1 || loading}
                >
                  Prev
                </button>
                <button
                  className="px-3 py-1 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.page >= totalPages || loading}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function SortHeader({
  col,
  label,
  sort,
  dir,
  onClick,
  align = "left",
}: {
  col: Sort;
  label: string;
  sort: Sort;
  dir: Dir;
  onClick: (col: Sort) => void;
  align?: "left" | "right";
}) {
  const active = sort === col;
  const arrow = active ? (dir === "asc" ? "↑" : "↓") : "";
  return (
    <th className={`py-2 font-medium ${align === "right" ? "text-right" : ""}`}>
      <button
        type="button"
        onClick={() => onClick(col)}
        className={`uppercase tracking-wide hover:text-gray-900 transition-colors ${
          active ? "text-gray-900" : "text-gray-500"
        }`}
      >
        {label}
        {active && <span className="ml-1">{arrow}</span>}
      </button>
    </th>
  );
}
