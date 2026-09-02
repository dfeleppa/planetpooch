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
import type { DaycareNotActiveReport as DaycareNotActiveReportData } from "@/lib/moego/daycare-not-active-types";

export function DaycareNotActiveReport({
  initialReport,
}: {
  initialReport: DaycareNotActiveReportData | null;
}) {
  const [report, setReport] = useState(initialReport);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
                  ? `${report.customerCount} daycare-tagged clients`
                  : "No stored report yet"}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {report
                  ? `Last updated ${formatDateTime(report.generatedAt)}`
                  : "Pull the report once to create the stored snapshot."}
              </p>
              {report ? (
                <p className="mt-1 text-xs text-gray-400">
                  Scanned {report.customersScanned} clients, including {report.daycareCustomersScanned} with the daycare tag.
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
              title="No daycare client report yet"
              description="Pull the report to list every non-deleted MoeGo client with the daycare tag."
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
              <TableHeader>Last appointment</TableHeader>
              <TableHeader className="text-right">Days since last</TableHeader>
              <TableHeader>Next appointment</TableHeader>
              <TableHeader>Contact</TableHeader>
            </tr>
          </TableHead>
          <TableBody>
            {report.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                  No non-deleted clients have the daycare tag.
                </TableCell>
              </TableRow>
            ) : (
              report.rows.map((row) => (
                <TableRow key={row.customerId}>
                  <TableCell className="font-medium">{row.customerName}</TableCell>
                  <TableCell>
                    {row.lastAppointmentDate
                      ? formatDate(row.lastAppointmentDate)
                      : <span className="text-gray-400">Never</span>}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {row.daysSinceLastAppointment ?? <span className="text-gray-400">—</span>}
                  </TableCell>
                  <TableCell>
                    {row.nextAppointmentDate
                      ? formatDate(row.nextAppointmentDate)
                      : <span className="text-gray-400">—</span>}
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
