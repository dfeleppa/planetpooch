"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const REPORT_TYPES = [{ value: "sales", label: "Sales" }] as const;
const ROWS_PER_PAGE = 4;

type LeadSourceReportRow = {
  id?: string;
  clientId: string;
  source: string;
  totalLeads: number | null;
  totalValueCents: number | null;
  open: number | null;
  won: number | null;
  lost: number | null;
  abandoned: number | null;
};

type ApiLeadSourceReportRow = Omit<LeadSourceReportRow, "clientId"> & {
  id: string;
};

const DEFAULT_ROWS: LeadSourceReportRow[] = [
  {
    clientId: "default-unattributed",
    source: "-",
    totalLeads: 6,
    totalValueCents: 0,
    open: 4,
    won: 0,
    lost: 2,
    abandoned: 0,
  },
  {
    clientId: "default-meta-ads",
    source: "meta ads",
    totalLeads: 442,
    totalValueCents: 1_346_084,
    open: 100,
    won: 31,
    lost: 311,
    abandoned: 0,
  },
  {
    clientId: "default-website",
    source: "website",
    totalLeads: 17,
    totalValueCents: 486_129,
    open: 2,
    won: 6,
    lost: 9,
    abandoned: 0,
  },
  {
    clientId: "default-started-form",
    source: "website getting started form",
    totalLeads: 49,
    totalValueCents: 149_866,
    open: 23,
    won: 4,
    lost: 22,
    abandoned: 0,
  },
];

function newClientId(): string {
  return `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneDefaultRows(): LeadSourceReportRow[] {
  return DEFAULT_ROWS.map((row) => ({ ...row, clientId: newClientId() }));
}

function displayDollars(cents: number | null): string {
  const amount = cents ?? 0;
  return amount === 0
    ? "$0"
    : (amount / 100).toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
}

function winPercent(row: LeadSourceReportRow): string {
  const totalLeads = row.totalLeads ?? 0;
  const won = row.won ?? 0;
  if (totalLeads <= 0) return "0.00%";
  return `${((won / totalLeads) * 100).toFixed(2)}%`;
}

function displayInteger(value: number | null): string {
  return (value ?? 0).toLocaleString("en-US");
}

function sumRows(
  rows: LeadSourceReportRow[],
  field: keyof Pick<
    LeadSourceReportRow,
    "totalLeads" | "totalValueCents" | "open" | "won" | "lost" | "abandoned"
  >
): number {
  return rows.reduce((sum, row) => sum + (row[field] ?? 0), 0);
}

export function LeadSourceReportTable({
  business,
  from,
  to,
}: {
  business: string;
  from: string;
  to: string;
}) {
  const [reportType, setReportType] = useState("sales");
  const [rows, setRows] = useState<LeadSourceReportRow[]>(() => cloneDefaultRows());
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const businessKey = business || "all-businesses";

  const loadRows = useCallback(async () => {
    setLoaded(false);
    setMessage(null);
    setError(null);
    const params = new URLSearchParams({
      business: businessKey,
      from,
      to,
      reportType,
    });

    try {
      const res = await fetch(`/api/finance/lead-source-report?${params.toString()}`);
      const json = (await res.json().catch(() => ({}))) as {
        rows?: ApiLeadSourceReportRow[];
      };
      if (res.ok && json.rows && json.rows.length > 0) {
        setRows(
          json.rows.map((row) => ({
            ...row,
            clientId: row.id,
          }))
        );
      } else {
        setRows(cloneDefaultRows());
      }
      setPage(0);
    } finally {
      setLoaded(true);
    }
  }, [businessKey, from, reportType, to]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = useMemo(() => {
    const start = currentPage * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [currentPage, rows]);
  const totals = useMemo(
    () => ({
      clientId: "totals",
      source: "Total",
      totalLeads: sumRows(rows, "totalLeads"),
      totalValueCents: sumRows(rows, "totalValueCents"),
      open: sumRows(rows, "open"),
      won: sumRows(rows, "won"),
      lost: sumRows(rows, "lost"),
      abandoned: sumRows(rows, "abandoned"),
    }),
    [rows]
  );

  async function pullFromApi() {
    setPulling(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch("/api/finance/lead-source-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: businessKey,
          periodStart: from,
          periodEnd: to,
          reportType,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: ApiLeadSourceReportRow[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(json.error ?? "Unable to pull lead source rows.");
      }

      setRows(
        Array.isArray(json.rows)
          ? json.rows.map((row) => ({
              ...row,
              clientId: row.id,
            }))
          : []
      );
      setPage(0);
      setMessage("Lead source report pulled from GHL.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to pull lead source rows.");
    } finally {
      setPulling(false);
    }
  }

  return (
    <Card className="mt-6 overflow-hidden rounded-lg shadow-none">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-base font-semibold text-gray-900">Lead Source Report</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={reportType}
            onChange={(event) => setReportType(event.target.value)}
            className="h-10 w-52 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 shadow-sm outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            aria-label="Report type"
          >
            {REPORT_TYPES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={pullFromApi}
            disabled={pulling || !loaded}
            className="h-10 rounded-lg border border-blue-600 bg-white px-4 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pulling ? "Pulling..." : "Pull from GHL"}
          </button>
        </div>
      </div>

      {(error || message) && (
        <div
          className={cn(
            "border-b px-4 py-2 text-sm",
            error
              ? "border-red-100 bg-red-50 text-red-700"
              : "border-green-100 bg-green-50 text-green-700"
          )}
          role={error ? "alert" : "status"}
        >
          {error || message}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-[780px] w-full table-fixed border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-900">
            <tr className="border-b border-gray-200">
              <th className="w-[24%] px-4 py-3">Source</th>
              <th className="w-[12%] px-3 py-3 text-right">Total Leads</th>
              <th className="w-[15%] px-3 py-3 text-right">Total Values</th>
              <th className="w-[10%] px-3 py-3 text-right">Open</th>
              <th className="w-[10%] px-3 py-3 text-right">Won</th>
              <th className="w-[10%] px-3 py-3 text-right">Lost</th>
              <th className="w-[11%] px-3 py-3 text-right">Abandoned</th>
              <th className="w-[8%] px-4 py-3 text-right">Win%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {!loaded ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-sm text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : (
              visibleRows.map((row, index) => (
                <tr
                  key={row.clientId}
                  className={cn(
                    "transition-colors hover:bg-gray-50",
                    index === visibleRows.length - 1 && "bg-gray-100 hover:bg-gray-100"
                  )}
                >
                  <td className="px-4 py-3 align-middle text-gray-900">
                    {row.source || "-"}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {displayInteger(row.totalLeads)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gray-900">
                    {displayDollars(row.totalValueCents)}
                  </td>
                  {(["open", "won", "lost", "abandoned"] as const).map((field) => (
                    <td
                      key={field}
                      className="px-3 py-3 text-right tabular-nums text-gray-900"
                    >
                      {displayInteger(row[field])}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {winPercent(row)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {loaded && rows.length > 0 && (
            <tfoot className="border-t border-gray-300 bg-gray-50 font-semibold text-gray-900">
              <tr>
                <td className="px-4 py-3 align-middle">Total</td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {displayInteger(totals.totalLeads)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {displayDollars(totals.totalValueCents)}
                </td>
                {(["open", "won", "lost", "abandoned"] as const).map((field) => (
                  <td key={field} className="px-3 py-3 text-right tabular-nums">
                    {displayInteger(totals[field])}
                  </td>
                ))}
                <td className="px-4 py-3 text-right tabular-nums">
                  {winPercent(totals)}
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4">
        <button
          type="button"
          onClick={() => setPage((value) => Math.max(0, value - 1))}
          disabled={currentPage === 0}
          className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Previous
        </button>
        <span className="grid h-9 min-w-9 place-items-center rounded-md border border-blue-600 px-3 text-sm font-medium text-blue-600">
          {currentPage + 1}
        </span>
        <button
          type="button"
          onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          disabled={currentPage >= pageCount - 1}
          className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-500 shadow-sm transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </Card>
  );
}
