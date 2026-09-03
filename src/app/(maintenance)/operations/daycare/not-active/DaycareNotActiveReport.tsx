"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@/components/ui/Table";
import { SortableTableHeader } from "@/components/ui/SortableTableHeader";
import type {
  DaycareNotActiveReport as DaycareNotActiveReportData,
  DaycareNotActiveReportRow,
} from "@/lib/moego/daycare-not-active-types";
import {
  compareSortValues,
  compareTableText,
  type SortDirection,
} from "@/lib/table-sort";

type InactiveSortKey = "customer" | "lastVisit" | "days" | "contact";

const INACTIVE_SORT_DEFAULTS: Record<InactiveSortKey, SortDirection> = {
  customer: "asc",
  lastVisit: "desc",
  days: "asc",
  contact: "asc",
};

export function DaycareNotActiveReport({
  initialReport,
}: {
  initialReport: DaycareNotActiveReportData | null;
}) {
  const [report, setReport] = useState(initialReport);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<InactiveSortKey>("lastVisit");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedRows = useMemo(() => {
    if (!report) return [];
    return [...report.rows].sort((left, right) => {
      const comparison = compareInactiveRows(
        left,
        right,
        sortKey,
        sortDirection
      );
      if (comparison !== 0) return comparison;
      return compareTableText(left.customerName, right.customerName);
    });
  }, [report, sortDirection, sortKey]);

  function toggleSort(nextSortKey: InactiveSortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(INACTIVE_SORT_DEFAULTS[nextSortKey]);
  }

  async function refreshReport() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/operations/daycare/not-active", {
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        report?: DaycareNotActiveReportData;
      };
      if (!response.ok || !payload.report) {
        setError(payload.error ?? "Could not refresh the not-active report.");
        return;
      }
      setReport(payload.report);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh the not-active report."
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {report
                  ? `${report.customerCount} inactive daycare clients`
                  : "No stored report yet"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {report
                  ? `Last updated ${formatDateTime(report.generatedAt)}`
                  : "Pull the report once to create the stored snapshot."}
              </p>
              {report ? (
                <p className="mt-1 text-xs text-gray-400">
                  Scanned {report.customersScanned} clients and found {report.daycareCustomersScanned} with completed daycare visits in the last 52 days.
                </p>
              ) : null}
            </div>
            <Button onClick={refreshReport} disabled={refreshing}>
              {refreshing ? "Refreshing…" : report ? "Refresh report" : "Pull report"}
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      {!report ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="◷"
              title="No inactive daycare report yet"
              description="Pull the report to find clients whose latest completed daycare visit was 31–52 days ago and who have no current or upcoming daycare appointment."
              action={
                <Button onClick={refreshReport} disabled={refreshing}>
                  {refreshing ? "Pulling report…" : "Pull report"}
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <SortableTableHeader
                label="Customer"
                sortKey="customer"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHeader
                label="Last daycare visit"
                sortKey="lastVisit"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHeader
                label="Days since visit"
                sortKey="days"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                align="right"
              />
              <SortableTableHeader
                label="Contact"
                sortKey="contact"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
            </tr>
          </TableHead>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-10 text-center text-gray-500">
                  No clients currently match the inactive daycare rule.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow key={row.customerId}>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell>
                    {row.lastAppointmentDate
                      ? formatDate(row.lastAppointmentDate)
                      : <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {row.daysSinceLastAppointment ?? <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell>
                    {row.email ? <div className="text-sm">{row.email}</div> : null}
                    {row.phone ? <div className="text-xs text-gray-500">{row.phone}</div> : null}
                    {!row.email && !row.phone && <span className="text-gray-400">—</span>}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function compareInactiveRows(
  left: DaycareNotActiveReportRow,
  right: DaycareNotActiveReportRow,
  sortKey: InactiveSortKey,
  direction: SortDirection
): number {
  switch (sortKey) {
    case "customer":
      return compareSortValues(left.customerName, right.customerName, direction);
    case "lastVisit":
      return compareSortValues(
        left.lastAppointmentDate,
        right.lastAppointmentDate,
        direction
      );
    case "days":
      return compareSortValues(
        left.daysSinceLastAppointment,
        right.daysSinceLastAppointment,
        direction
      );
    case "contact":
      return compareSortValues(
        left.email ?? left.phone,
        right.email ?? right.phone,
        direction
      );
  }
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/New_York",
  });
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}
