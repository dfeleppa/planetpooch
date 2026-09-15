"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const ROWS_PER_PAGE = 20;

type GoogleLsaLeadRow = {
  id: string;
  customer: string | null;
  jobType: string | null;
  searchIntent: string | null;
  location: string | null;
  leadType: string | null;
  chargeStatus: string | null;
  leadReceived: string | null;
  lastActivity: string | null;
  totalPaidCents: number | null;
};

const COLUMNS = [
  { key: "customer", label: "Customer" },
  { key: "jobType", label: "Job type" },
  { key: "searchIntent", label: "Search intent" },
  { key: "location", label: "Location" },
  { key: "leadType", label: "Lead type" },
  { key: "chargeStatus", label: "Charge status" },
  { key: "leadReceived", label: "Lead received" },
  { key: "lastActivity", label: "Last activity" },
] as const;

function display(value: string | null): string {
  return value?.trim() || "—";
}

function formatMoney(value: number | null): string {
  if (value === null) return "—";
  return (value / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function GoogleLsaLeadReportTable({
  business,
  from,
  to,
}: {
  business: string;
  from: string;
  to: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<GoogleLsaLeadRow[]>([]);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const businessKey = business || "all-businesses";

  const loadRows = useCallback(async () => {
    setLoaded(false);
    setError(null);
    const params = new URLSearchParams({ business: businessKey, from, to });

    try {
      const response = await fetch(
        `/api/finance/google-lsa-lead-report?${params.toString()}`
      );
      const json = (await response.json().catch(() => ({}))) as {
        rows?: GoogleLsaLeadRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(json.error ?? "Unable to load Google LSA leads.");
      setRows(Array.isArray(json.rows) ? json.rows : []);
      setPage(0);
    } catch (loadError) {
      setRows([]);
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load Google LSA leads."
      );
    } finally {
      setLoaded(true);
    }
  }, [businessKey, from, to]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const currentPage = Math.min(page, pageCount - 1);
  const visibleRows = useMemo(() => {
    const start = currentPage * ROWS_PER_PAGE;
    return rows.slice(start, start + ROWS_PER_PAGE);
  }, [currentPage, rows]);
  const totalPaidCents = useMemo(
    () => rows.reduce((sum, row) => sum + (row.totalPaidCents ?? 0), 0),
    [rows]
  );

  async function importCsv() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choose a Google LSA CSV file before importing.");
      return;
    }

    setImporting(true);
    setError(null);
    setMessage(null);
    const form = new FormData();
    form.append("business", businessKey);
    form.append("periodStart", from);
    form.append("periodEnd", to);
    form.append("file", file);

    try {
      const response = await fetch("/api/finance/google-lsa-lead-report", {
        method: "POST",
        body: form,
      });
      const json = (await response.json().catch(() => ({}))) as {
        rows?: GoogleLsaLeadRow[];
        error?: string;
      };
      if (!response.ok) throw new Error(json.error ?? "Unable to import Google LSA leads.");
      const nextRows = Array.isArray(json.rows) ? json.rows : [];
      setRows(nextRows);
      setPage(0);
      setMessage(`${nextRows.length.toLocaleString("en-US")} Google LSA leads imported.`);
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Unable to import Google LSA leads."
      );
    } finally {
      setImporting(false);
    }
  }

  return (
    <Card className="mt-6 overflow-hidden rounded-lg shadow-none">
      <div className="flex flex-col gap-3 border-b border-gray-200 bg-white px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Google LSA Lead Report</h2>
          <p className="mt-1 text-xs text-gray-500">
            {rows.length.toLocaleString("en-US")} leads · {formatMoney(totalPaidCents)} total paid
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-10 max-w-56 cursor-pointer items-center rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50">
            <span className="truncate">{fileName || "Choose CSV"}</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
              aria-label="Choose Google LSA lead CSV"
            />
          </label>
          <button
            type="button"
            onClick={importCsv}
            disabled={importing}
            className="h-10 rounded-lg border border-blue-600 bg-white px-4 text-sm font-semibold text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {importing ? "Importing..." : "Import CSV"}
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
        <table className="min-w-[1450px] w-full border-collapse text-sm">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-900">
            <tr className="border-b border-gray-200">
              {COLUMNS.map((column) => (
                <th key={column.key} className="px-3 py-3 text-left">
                  {column.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right">Total paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {!loaded ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  Loading...
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  No Google LSA leads for this period.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  {COLUMNS.map((column) => (
                    <td
                      key={column.key}
                      className="max-w-64 overflow-hidden text-ellipsis whitespace-nowrap px-3 py-3 text-gray-900"
                      title={display(row[column.key])}
                    >
                      {display(row[column.key])}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-gray-900">
                    {formatMoney(row.totalPaidCents)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
        <p className="text-sm text-gray-500">{rows.length.toLocaleString("en-US")} rows</p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            disabled={currentPage === 0}
            className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
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
            className="h-9 rounded-lg border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>
    </Card>
  );
}
