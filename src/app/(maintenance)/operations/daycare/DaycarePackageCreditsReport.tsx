"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import {
  DAYCARE_PACKAGE_RULES,
  type DaycarePackageCreditReport,
} from "@/lib/moego/daycare-package-credit-types";

export function DaycarePackageCreditsReport({
  initialReport,
}: {
  initialReport: DaycarePackageCreditReport | null;
}) {
  const [report, setReport] = useState(initialReport);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refreshReport() {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetch("/api/operations/daycare/package-credits", {
        method: "POST",
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        report?: DaycarePackageCreditReport;
      };
      if (!response.ok || !payload.report) {
        setError(payload.error ?? "Could not refresh the daycare package report.");
        return;
      }
      setReport(payload.report);
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh the daycare package report."
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
                <p className="mt-1 text-xs text-gray-500">
                  Expires within {rule.expirationWindowDays} days
                </p>
                <div className="mt-4 flex items-end justify-between">
                  <div>
                    <p className="text-2xl font-bold text-blue-700">{matchingRows.length}</p>
                    <p className="text-xs text-gray-500">packages</p>
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
                  ? `${report.packageCount} packages · ${report.totalRemainingCredits} credits`
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
              icon="☀"
              title="No daycare package report yet"
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
              <TableHeader>Customer</TableHeader>
              <TableHeader>Package</TableHeader>
              <TableHeader className="text-right">Credits left</TableHeader>
              <TableHeader>Expires</TableHeader>
              <TableHeader>Contact</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                  No packages currently match the expiration windows.
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((row) => (
                <TableRow key={row.packageId}>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell>
                    <div>{row.packageName}</div>
                    <div className="mt-0.5 text-xs text-gray-400">
                      {row.expirationWindowDays}-day window
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-base font-semibold tabular-nums">
                    {row.remainingCredits}
                  </TableCell>
                  <TableCell>
                    <div>{formatDate(row.expirationDate)}</div>
                    <div className="mt-0.5 text-xs text-amber-700">
                      {formatDaysRemaining(row.daysUntilExpiration)}
                    </div>
                  </TableCell>
                  <TableCell>
                    {row.email && <div className="text-sm">{row.email}</div>}
                    {row.phone && <div className="text-xs text-gray-500">{row.phone}</div>}
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

function formatDaysRemaining(days: number): string {
  if (days === 0) return "Expires today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}
