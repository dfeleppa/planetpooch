"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  saveCommissionPaidDate,
  type CommissionBusinessSegment,
} from "./actions";

export interface CommissionRow {
  weekStart: string;
  weekEnding: string;
  revenueCents: number[];
  paidDate: string;
  commissionEntryId?: string;
  updatedAt?: string;
}

interface CommissionTableConfig {
  employeeName: "Kim" | "Rebecca" | "Gabriela";
  businessSegment: CommissionBusinessSegment;
  segmentLabel: string;
  heading: string;
  description: string;
  columnLabels: string[];
  commissionLabel: string;
  rows: CommissionRow[];
  calculateCommission: (totalCents: number) => number;
}

interface PaidDateEdit {
  row: CommissionRow;
  employeeName: "Kim" | "Rebecca" | "Gabriela";
  businessSegment: CommissionBusinessSegment;
  paidDate: string;
  confirmedEdit: boolean;
}

const EMPLOYEES = ["Kim", "Gabriela", "Rebecca"] as const;
const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});
const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "UTC" });
const dateInputClass =
  "w-full min-w-36 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

function formatDate(value: string): string {
  if (!value) return "Not paid";
  return dateFormatter.format(new Date(`${value}T00:00:00.000Z`));
}

function fivePercentCommission(totalCents: number): number {
  return Math.round(totalCents * 0.05);
}

function gabrielaCommission(totalCents: number): number {
  return Math.max(0, Math.round((totalCents - 100_000) * 0.05));
}

export function CommissionsLedger({
  kimRows,
  rebeccaRows,
  gabrielaRows,
}: {
  kimRows: CommissionRow[];
  rebeccaRows: CommissionRow[];
  gabrielaRows: CommissionRow[];
}) {
  const router = useRouter();
  const [employee, setEmployee] = useState<(typeof EMPLOYEES)[number] | "">("");
  const [selectedYear, setSelectedYear] = useState("");
  const [editing, setEditing] = useState<PaidDateEdit | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const tableConfig: CommissionTableConfig | null =
    employee === "Kim"
      ? {
          employeeName: "Kim",
          businessSegment: "BOARDING",
          segmentLabel: "Boarding",
          heading: "Kim’s weekly boarding commissions",
          description:
            "Packages and addons come directly from Boarding. Commission is 5% of the total.",
          columnLabels: ["Packages", "Addons"],
          commissionLabel: "Commission (5%)",
          rows: kimRows,
          calculateCommission: fivePercentCommission,
        }
      : employee === "Rebecca"
      ? {
          employeeName: "Rebecca",
          businessSegment: "TRAINING",
          segmentLabel: "Training",
          heading: "Rebecca’s weekly training commissions",
          description:
            "Revenue comes directly from the Training business segment. Commission is 5% of the total.",
          columnLabels: ["Product sales", "Group revenue", "1:1 revenue"],
          commissionLabel: "Commission (5%)",
          rows: rebeccaRows,
          calculateCommission: fivePercentCommission,
        }
      : employee === "Gabriela"
        ? {
            employeeName: "Gabriela",
            businessSegment: "IN_HOUSE_GROOMING",
            segmentLabel: "In-House Grooming",
            heading: "Gabriela’s weekly in-house grooming commissions",
            description:
              "Revenue and upsells come directly from In-House Grooming. Commission is 5% of the amount above $1,000, with a $0 floor.",
            columnLabels: ["Revenue", "Upsells"],
            commissionLabel: "Commission ((Total - $1,000) × 5%)",
            rows: gabrielaRows,
            calculateCommission: gabrielaCommission,
          }
        : null;

  const availableYears = tableConfig
    ? [...new Set(tableConfig.rows.map((row) => row.weekEnding.slice(0, 4)))].sort((a, b) =>
        b.localeCompare(a)
      )
    : [];
  const activeYear =
    selectedYear && availableYears.includes(selectedYear)
      ? selectedYear
      : availableYears[0] ?? "";
  const visibleRows = tableConfig
    ? tableConfig.rows.filter((row) => row.weekEnding.startsWith(activeYear))
    : [];

  const startPaidDateEdit = (config: CommissionTableConfig, row: CommissionRow) => {
    if (row.commissionEntryId) {
      const confirmed = window.confirm(
        `Warning: ${config.employeeName}'s paid date has already been entered for this ${config.segmentLabel} week. Continue editing it?`
      );
      if (!confirmed) return;
    }

    setError("");
    setEditing({
      row,
      employeeName: config.employeeName,
      businessSegment: config.businessSegment,
      paidDate: row.paidDate,
      confirmedEdit: Boolean(row.commissionEntryId),
    });
  };

  const savePaidDate = async () => {
    if (!editing) return;
    if (!editing.row.commissionEntryId && !editing.paidDate) {
      setError(`Choose the date ${editing.employeeName} was paid.`);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const result = await saveCommissionPaidDate({
        id: editing.row.commissionEntryId,
        employeeName: editing.employeeName,
        businessSegment: editing.businessSegment,
        weekStart: editing.row.weekStart,
        paidDate: editing.paidDate,
        confirmEdit: editing.confirmedEdit,
        expectedUpdatedAt: editing.row.updatedAt,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEditing(null);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="py-6">
          <div className="max-w-md">
            <label htmlFor="resort-employee" className="block text-sm font-medium text-gray-700">
              Resort employee
            </label>
            <select
              id="resort-employee"
              name="resortEmployee"
              value={employee}
              onChange={(event) => {
                setEmployee(event.target.value as (typeof EMPLOYEES)[number] | "");
                setSelectedYear("");
                setEditing(null);
                setError("");
              }}
              className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 transition-colors focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="" disabled>
                Select a resort employee
              </option>
              {EMPLOYEES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {tableConfig ? (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-gray-100 px-6 py-4">
            <div>
              <h3 className="font-semibold text-gray-900">{tableConfig.heading}</h3>
              <p className="mt-1 text-sm text-gray-500">{tableConfig.description}</p>
            </div>
            {availableYears.length > 0 ? (
              <div>
                <label htmlFor="commission-year" className="block text-xs font-medium text-gray-600">
                  Year
                </label>
                <select
                  id="commission-year"
                  value={activeYear}
                  onChange={(event) => {
                    setSelectedYear(event.target.value);
                    setEditing(null);
                    setError("");
                  }}
                  className="mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {availableYears.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>

          {editing?.row.commissionEntryId ? (
            <div className="border-b border-yellow-200 bg-yellow-50 px-6 py-3 text-sm text-yellow-800">
              Warning: you are editing a paid date that was previously entered. Review the date before saving.
            </div>
          ) : null}

          {error ? (
            <div role="alert" className="border-b border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3">Week ending</th>
                  {tableConfig.columnLabels.map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                  <th className="px-4 py-3">Total</th>
                  <th className="px-4 py-3">{tableConfig.commissionLabel}</th>
                  <th className="px-4 py-3">Paid date</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((row) => {
                  const totalCents = row.revenueCents.reduce((sum, value) => sum + value, 0);
                  const isEditing =
                    editing?.businessSegment === tableConfig.businessSegment &&
                    editing.row.weekStart === row.weekStart;

                  return (
                    <tr key={row.weekStart} className="text-gray-700">
                      <td className="whitespace-nowrap px-4 py-4 font-medium text-gray-900">
                        {formatDate(row.weekEnding)}
                      </td>
                      {row.revenueCents.map((value, index) => (
                        <td key={tableConfig.columnLabels[index]} className="whitespace-nowrap px-4 py-4">
                          {moneyFormatter.format(value / 100)}
                        </td>
                      ))}
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-gray-900">
                        {moneyFormatter.format(totalCents / 100)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 font-semibold text-blue-700">
                        {moneyFormatter.format(tableConfig.calculateCommission(totalCents) / 100)}
                      </td>
                      <td className="px-4 py-3">
                        {isEditing && editing ? (
                          <input
                            aria-label={`Paid date for ${tableConfig.employeeName}, week ending ${row.weekEnding}`}
                            type="date"
                            value={editing.paidDate}
                            onChange={(event) =>
                              setEditing((current) =>
                                current ? { ...current, paidDate: event.target.value } : current
                              )
                            }
                            className={dateInputClass}
                          />
                        ) : (
                          <span className="whitespace-nowrap">{formatDate(row.paidDate)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          {isEditing ? (
                            <>
                              <Button size="sm" onClick={savePaidDate} disabled={saving}>
                                {saving ? "Saving..." : "Save"}
                              </Button>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setEditing(null);
                                  setError("");
                                }}
                                disabled={saving}
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => startPaidDateEdit(tableConfig, row)}
                              disabled={Boolean(editing)}
                            >
                              {row.commissionEntryId ? "Edit paid date" : "Set paid date"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {visibleRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={tableConfig.columnLabels.length + 5}
                      className="px-6 py-12 text-center text-sm text-gray-500"
                    >
                      No {tableConfig.segmentLabel} revenue weeks are available yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
