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

function dollars(cents: number | null): string {
  if (cents === null) return "";
  return (cents / 100).toString();
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

function parseIntegerInput(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed);
}

function parseCurrencyInput(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

function winPercent(row: LeadSourceReportRow): string {
  const totalLeads = row.totalLeads ?? 0;
  const won = row.won ?? 0;
  if (totalLeads <= 0) return "0.00%";
  return `${((won / totalLeads) * 100).toFixed(2)}%`;
}

function inputClass(className?: string) {
  return cn(
    "h-9 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-gray-900 outline-none transition-colors",
    "hover:border-gray-200 hover:bg-white focus:border-blue-500 focus:bg-white focus:ring-2 focus:ring-blue-100",
    className
  );
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const businessKey = business || "all-businesses";

  const loadRows = useCallback(async () => {
    setLoaded(false);
    setSaved(false);
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

  function updateRow(
    visibleIndex: number,
    patch: Partial<Omit<LeadSourceReportRow, "clientId">>
  ) {
    setSaved(false);
    const rowIndex = currentPage * ROWS_PER_PAGE + visibleIndex;
    setRows((current) =>
      current.map((row, index) => (index === rowIndex ? { ...row, ...patch } : row))
    );
  }

  function addRow() {
    setSaved(false);
    setRows((current) => [
      ...current,
      {
        clientId: newClientId(),
        source: "",
        totalLeads: null,
        totalValueCents: null,
        open: null,
        won: null,
        lost: null,
        abandoned: null,
      },
    ]);
    setPage(Math.floor(rows.length / ROWS_PER_PAGE));
  }

  async function saveRows() {
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/finance/lead-source-report", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: businessKey,
          periodStart: from,
          periodEnd: to,
          reportType,
          rows,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        rows?: ApiLeadSourceReportRow[];
      };
      if (res.ok && json.rows) {
        setRows(
          json.rows.map((row) => ({
            ...row,
            clientId: row.id,
          }))
        );
        setSaved(true);
      }
    } finally {
      setSaving(false);
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
            onClick={addRow}
            className="grid h-10 w-10 place-items-center rounded-lg border border-transparent text-lg font-semibold text-blue-600 transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-100"
            aria-label="Add lead source row"
            title="Add row"
          >
            +
          </button>
          <button
            type="button"
            onClick={saveRows}
            disabled={saving || !loaded}
            className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Saving..." : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

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
                  <td className="px-2 py-1 align-middle">
                    <input
                      value={row.source}
                      onChange={(event) => updateRow(index, { source: event.target.value })}
                      className={inputClass("text-left")}
                      aria-label={`Source row ${index + 1}`}
                    />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={row.totalLeads ?? ""}
                      onChange={(event) =>
                        updateRow(index, {
                          totalLeads: parseIntegerInput(event.target.value),
                        })
                      }
                      className={inputClass("text-right tabular-nums")}
                      aria-label={`Total leads for ${row.source || "row"}`}
                    />
                  </td>
                  <td className="px-2 py-1 align-middle">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                        $
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={dollars(row.totalValueCents)}
                        onChange={(event) =>
                          updateRow(index, {
                            totalValueCents: parseCurrencyInput(event.target.value),
                          })
                        }
                        onBlur={(event) => {
                          if (event.target.value === "") return;
                          event.currentTarget.title = displayDollars(row.totalValueCents);
                        }}
                        className={inputClass("pl-6 text-right tabular-nums")}
                        aria-label={`Total value for ${row.source || "row"}`}
                      />
                    </div>
                  </td>
                  {(["open", "won", "lost", "abandoned"] as const).map((field) => (
                    <td key={field} className="px-2 py-1 align-middle">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={row[field] ?? ""}
                        onChange={(event) =>
                          updateRow(index, {
                            [field]: parseIntegerInput(event.target.value),
                          })
                        }
                        className={inputClass("text-right tabular-nums")}
                        aria-label={`${field} leads for ${row.source || "row"}`}
                      />
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                    {winPercent(row)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
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
