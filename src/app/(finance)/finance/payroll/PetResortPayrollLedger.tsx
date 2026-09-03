"use client";

import { useMemo, useState } from "react";
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

function quarterForDate(date: string): number {
  return Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1;
}

export function PetResortPayrollLedger({ rows }: { rows: PetResortPayrollRunRow[] }) {
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
  const visibleRows = rows.filter(
    (row) => Number(row.checkDate.slice(0, 4)) === year && quarterForDate(row.checkDate) === quarter
  );

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

        <Table>
          <TableHead>
            <TableRow>
              <TableHeader>Payroll type</TableHeader>
              <TableHeader>Check date</TableHeader>
              <TableHeader className="text-right">Amount</TableHeader>
              <TableHeader>Pay period</TableHeader>
              <TableHeader>Schedule</TableHeader>
              <TableHeader>Pay run date and time (ET)</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-gray-500">
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
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
