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
  createdTime: string;
  orderCount: number;
  revenueCents: number;
  lastOrderTime: string | null;
};

type ApiResponse = {
  rows: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: "ltv" | "recent" | "created";
};

type Sort = ApiResponse["sort"];

const SORTS: { value: Sort; label: string }[] = [
  { value: "ltv", label: "LTV" },
  { value: "recent", label: "Last order" },
  { value: "created", label: "Newest" },
];

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
  }, [debounced, sort]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        sort,
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
  }, [page, sort, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Customers</h2>
            <p className="text-xs text-gray-500 mt-1">
              One row per MoeGo customer. LTV is sum of paidAmount across all
              their orders.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, phone…"
              className="w-56"
            />
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {SORTS.map((s) => (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                    sort === s.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
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
                    <th className="py-2 font-medium">Name</th>
                    <th className="py-2 font-medium">Contact</th>
                    <th className="py-2 font-medium">Lead source</th>
                    <th className="py-2 font-medium">Acquired</th>
                    <th className="py-2 font-medium text-right">Orders</th>
                    <th className="py-2 font-medium text-right">LTV</th>
                    <th className="py-2 font-medium">Last order</th>
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
