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
import {
  DAYCARE_PACKAGE_RULES,
  EXPIRED_DAYCARE_PACKAGE_WINDOW_DAYS,
  type DaycarePackageCreditReport,
  type DaycarePackageCreditReportRow,
} from "@/lib/moego/daycare-package-credit-types";
import {
  compareSortValues,
  compareTableText,
  type SortDirection,
} from "@/lib/table-sort";

type ExpiredPackageSortKey =
  | "customer"
  | "package"
  | "credits"
  | "expired"
  | "contact";

const EXPIRED_PACKAGE_SORT_DEFAULTS: Record<
  ExpiredPackageSortKey,
  SortDirection
> = {
  customer: "asc",
  package: "asc",
  credits: "desc",
  expired: "desc",
  contact: "asc",
};

export function ExpiredDaycarePackagesReport({
  initialReport,
}: {
  initialReport: DaycarePackageCreditReport | null;
}) {
  const [report, setReport] = useState(initialReport);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ExpiredPackageSortKey>("expired");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sortedRows = useMemo(() => {
    if (!report) return [];
    return [...report.rows].sort((left, right) => {
      const comparison = compareExpiredPackageRows(
        left,
        right,
        sortKey,
        sortDirection
      );
      if (comparison !== 0) {
        return comparison;
      }
      return compareTableText(left.customerName, right.customerName);
    });
  }, [report, sortDirection, sortKey]);

  function toggleSort(nextSortKey: ExpiredPackageSortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(nextSortKey);
    setSortDirection(EXPIRED_PACKAGE_SORT_DEFAULTS[nextSortKey]);
  }

  async function refreshReport() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/operations/daycare/expired-packages", {
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        report?: DaycarePackageCreditReport;
      };
      if (!response.ok || !payload.report) {
        setError(payload.error ?? "Could not refresh the expired packages report.");
        return;
      }
      setReport(payload.report);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh the expired packages report."
      );
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        {DAYCARE_PACKAGE_RULES.map((rule) => {
          const matchingRows =
            report?.rows.filter((row) => row.packageName === rule.packageName) ?? [];
          const credits = matchingRows.reduce(
            (sum, row) => sum + row.remainingCredits,
            0
          );
          return (
            <Card key={rule.packageName}>
              <CardContent className="py-4">
                <p className="text-sm font-semibold text-gray-900">
                  {rule.packageName}
                </p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-blue-700">
                      {matchingRows.length}
                    </p>
                    <p className="text-xs text-gray-500">expired packages</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-semibold text-gray-900">{credits}</p>
                    <p className="text-xs text-gray-500">credits left</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {report
                  ? `${report.packageCount} packages · ${report.totalRemainingCredits} credits left`
                  : "No stored report yet"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {report
                  ? `Last updated ${formatDateTime(report.generatedAt)}`
                  : "Pull the report once to create the stored snapshot."}
              </p>
              <p className="mt-1 text-xs text-gray-400">
                This snapshot changes only when Refresh report is requested.
              </p>
            </div>
            <Button onClick={refreshReport} disabled={refreshing}>
              {refreshing ? "Refreshing…" : report ? "Refresh report" : "Pull report"}
            </Button>
          </div>
          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {!report ? (
        <Card>
          <CardContent>
            <EmptyState
              icon="⌛"
              title="No expired packages report yet"
              description="Pull the report to scan MoeGo and save the first snapshot."
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
                label="Package"
                sortKey="package"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
              />
              <SortableTableHeader
                label="Credits left"
                sortKey="credits"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
                align="right"
              />
              <SortableTableHeader
                label="Expired"
                sortKey="expired"
                activeSortKey={sortKey}
                direction={sortDirection}
                onSort={toggleSort}
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
                <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                  No selected daycare packages expired in the last {EXPIRED_DAYCARE_PACKAGE_WINDOW_DAYS} days.
                </TableCell>
              </TableRow>
            ) : (
              sortedRows.map((row) => (
                <TableRow key={row.packageId}>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell>{row.packageName}</TableCell>
                  <TableCell className="text-right text-base font-semibold tabular-nums">
                    {row.remainingCredits}
                  </TableCell>
                  <TableCell>
                    <div>{formatDate(row.expirationDate)}</div>
                    <div className="mt-0.5 text-xs text-red-700">
                      {formatDaysExpired(row.daysUntilExpiration)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.email ? <div className="text-sm">{row.email}</div> : null}
                    {row.phone ? <div className="text-xs text-gray-500">{row.phone}</div> : null}
                    {!row.email && !row.phone ? <span className="text-gray-400">—</span> : null}
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

function compareExpiredPackageRows(
  left: DaycarePackageCreditReportRow,
  right: DaycarePackageCreditReportRow,
  sortKey: ExpiredPackageSortKey,
  direction: SortDirection
): number {
  switch (sortKey) {
    case "customer":
      return compareSortValues(left.customerName, right.customerName, direction);
    case "package":
      return compareSortValues(left.packageName, right.packageName, direction);
    case "credits":
      return compareSortValues(
        left.remainingCredits,
        right.remainingCredits,
        direction
      );
    case "expired":
      return compareSortValues(
        left.expirationDate,
        right.expirationDate,
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
  return new Date(`${value}T00:00:00.000Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
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

function formatDaysExpired(daysUntilExpiration: number): string {
  const daysExpired = Math.abs(daysUntilExpiration);
  if (daysExpired === 0) return "Expired today";
  if (daysExpired === 1) return "Expired 1 day ago";
  return `Expired ${daysExpired} days ago`;
}
