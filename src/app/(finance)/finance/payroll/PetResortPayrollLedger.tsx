"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/Select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { createPetResortPayrollRun } from "./actions";

export type PetResortPayrollRunRow = {
  id: string;
  payrollType: string;
  checkDate: string;
  amount: string;
  payPeriod: string;
  schedule: string;
  payRunAt: string;
};

const easternYearFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
});

const easternMonthFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "numeric",
});

const checkDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "numeric",
  year: "numeric",
});

const payRunFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const moneyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const inputClassName =
  "w-full min-w-32 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

const initialEntry = {
  payrollType: "Regular",
  checkDate: "",
  amount: "",
  payPeriodStart: "",
  payPeriodEnd: "",
  schedule: "Weekly",
  payRunAt: "",
};

function quarterForDate(date: string): number {
  return Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;
}

export function PetResortPayrollLedger({ rows }: { rows: PetResortPayrollRunRow[] }) {
  const router = useRouter();
  const currentYear = Number(easternYearFormatter.format(new Date()));
  const availableYears = useMemo(() => {
    const years = new Set(rows.map((row) => Number(row.checkDate.slice(0, 4))));
    years.add(currentYear);
    return [...years].sort((a, b) => b - a);
  }, [currentYear, rows]);
  const [year, setYear] = useState(currentYear);
  const [quarter, setQuarter] = useState(
    Math.floor((Number(easternMonthFormatter.format(new Date())) - 1) / 3) + 1
  );
  const [entry, setEntry] = useState(initialEntry);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const visibleRows = rows.filter(
    (row) => Number(row.checkDate.slice(0, 4)) === year && quarterForDate(row.checkDate) === quarter
  );

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const parsedPayRunAt = new Date(entry.payRunAt);
      if (Number.isNaN(parsedPayRunAt.getTime())) {
        setError("Enter a valid pay-run date and time.");
        return;
      }
      const payRunAt = parsedPayRunAt.toISOString();
      const result = await createPetResortPayrollRun({ ...entry, payRunAt });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      setEntry(initialEntry);
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-4">
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Select
            id="payroll-year"
            label="Year"
            value={year}
            onChange={(event) => setYear(Number(event.target.value))}
          >
            {availableYears.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
          <Select
            id="payroll-quarter"
            label="Quarter"
            value={quarter}
            onChange={(event) => setQuarter(Number(event.target.value))}
          >
            {[1, 2, 3, 4].map((option) => (
              <option key={option} value={option}>
                Q{option}
              </option>
            ))}
          </Select>
        </div>

        <form onSubmit={saveEntry} className="space-y-3">
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Payroll type</TableHeader>
                <TableHeader>Check date</TableHeader>
                <TableHeader className="text-right">Amount</TableHeader>
                <TableHeader>Pay period</TableHeader>
                <TableHeader>Schedule</TableHeader>
                <TableHeader>Pay run date and time (ET)</TableHeader>
                <TableHeader>Action</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow className="bg-blue-50/60 align-top">
                <TableCell>
                  <label htmlFor="new-payroll-type" className="sr-only">
                    Payroll type
                  </label>
                  <input
                    id="new-payroll-type"
                    value={entry.payrollType}
                    onChange={(event) => setEntry({ ...entry, payrollType: event.target.value })}
                    className={inputClassName}
                    required
                  />
                </TableCell>
                <TableCell>
                  <label htmlFor="new-check-date" className="sr-only">
                    Check date
                  </label>
                  <input
                    id="new-check-date"
                    type="date"
                    value={entry.checkDate}
                    onChange={(event) => setEntry({ ...entry, checkDate: event.target.value })}
                    className={inputClassName}
                    required
                  />
                </TableCell>
                <TableCell>
                  <label htmlFor="new-payroll-amount" className="sr-only">
                    Amount
                  </label>
                  <input
                    id="new-payroll-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={entry.amount}
                    onChange={(event) => setEntry({ ...entry, amount: event.target.value })}
                    className={inputClassName}
                    required
                  />
                </TableCell>
                <TableCell>
                  <div className="flex min-w-72 items-center gap-2">
                    <div>
                      <label htmlFor="new-period-start" className="sr-only">
                        Pay period start
                      </label>
                      <input
                        id="new-period-start"
                        type="date"
                        value={entry.payPeriodStart}
                        onChange={(event) =>
                          setEntry({ ...entry, payPeriodStart: event.target.value })
                        }
                        className={inputClassName}
                        required
                      />
                    </div>
                    <span className="text-gray-500">to</span>
                    <div>
                      <label htmlFor="new-period-end" className="sr-only">
                        Pay period end
                      </label>
                      <input
                        id="new-period-end"
                        type="date"
                        value={entry.payPeriodEnd}
                        onChange={(event) =>
                          setEntry({ ...entry, payPeriodEnd: event.target.value })
                        }
                        className={inputClassName}
                        required
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <label htmlFor="new-payroll-schedule" className="sr-only">
                    Schedule
                  </label>
                  <input
                    id="new-payroll-schedule"
                    value={entry.schedule}
                    onChange={(event) => setEntry({ ...entry, schedule: event.target.value })}
                    className={inputClassName}
                    required
                  />
                </TableCell>
                <TableCell>
                  <label htmlFor="new-pay-run-at" className="sr-only">
                    Pay run date and time (ET)
                  </label>
                  <input
                    id="new-pay-run-at"
                    type="datetime-local"
                    value={entry.payRunAt}
                    onChange={(event) => setEntry({ ...entry, payRunAt: event.target.value })}
                    className="w-full min-w-52 rounded-lg border border-gray-300 bg-white px-2 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </TableCell>
                <TableCell>
                  <Button type="submit" size="sm" disabled={saving} className="whitespace-nowrap">
                    {saving ? "Saving…" : "Add payroll"}
                  </Button>
                </TableCell>
              </TableRow>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-gray-500">
                    No Pet Resort payroll runs for Q{quarter} {year}.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.payrollType}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {checkDateFormatter.format(new Date(`${row.checkDate}T00:00:00.000Z`))}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-medium">
                      {moneyFormatter.format(Number(row.amount))}
                    </TableCell>
                    <TableCell>{row.payPeriod}</TableCell>
                    <TableCell>{row.schedule}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {payRunFormatter.format(new Date(row.payRunAt))}
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </form>
      </CardContent>
    </Card>
  );
}
