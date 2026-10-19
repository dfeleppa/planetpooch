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
import { createPetResortPayrollRun, updatePetResortPayrollRun } from "./actions";

export type PetResortPayrollRunRow = {
  id: string;
  payrollType: string;
  checkDate: string;
  amount: string;
  payPeriod: string;
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
};

type EditableEntry = typeof initialEntry & { id: string };

function usDateToIso(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  return match ? `${match[3]}-${match[1]}-${match[2]}` : "";
}

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
  const [editing, setEditing] = useState<EditableEntry | null>(null);
  const [editError, setEditError] = useState("");
  const visibleRows = rows.filter(
    (row) => Number(row.checkDate.slice(0, 4)) === year && quarterForDate(row.checkDate) === quarter
  );

  const saveEntry = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const result = await createPetResortPayrollRun({
        ...entry,
        schedule: "Weekly",
        payRunAt: new Date().toISOString(),
      });
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

  const startEditing = (row: PetResortPayrollRunRow) => {
    const [start, end] = row.payPeriod.split(" to ");
    setEditing({
      id: row.id,
      payrollType: row.payrollType,
      checkDate: row.checkDate,
      amount: row.amount,
      payPeriodStart: usDateToIso(start ?? ""),
      payPeriodEnd: usDateToIso(end ?? ""),
    });
    setEditError("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    setEditError("");
    try {
      const result = await updatePetResortPayrollRun(editing);
      if (!result.ok) {
        setEditError(result.error);
        return;
      }
      setYear(Number(editing.checkDate.slice(0, 4)));
      setQuarter(quarterForDate(editing.checkDate));
      setEditing(null);
      router.refresh();
    } catch {
      setEditError("Could not update the payroll run. Please try again.");
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
                  <Button type="submit" size="sm" disabled={saving} className="whitespace-nowrap">
                    {saving ? "Saving…" : "Add payroll"}
                  </Button>
                </TableCell>
              </TableRow>
              {visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-gray-500">
                    No Pet Resort payroll runs for Q{quarter} {year}.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) =>
                  editing?.id === row.id ? (
                    <TableRow key={row.id} className="bg-amber-50/60 align-top">
                      <TableCell>
                        <label htmlFor={`edit-type-${row.id}`} className="sr-only">Payroll type</label>
                        <input id={`edit-type-${row.id}`} value={editing.payrollType} maxLength={50}
                          onChange={(event) => setEditing({ ...editing, payrollType: event.target.value })}
                          className={inputClassName} required />
                      </TableCell>
                      <TableCell>
                        <label htmlFor={`edit-check-date-${row.id}`} className="sr-only">Check date</label>
                        <input id={`edit-check-date-${row.id}`} type="date" value={editing.checkDate}
                          onChange={(event) => setEditing({ ...editing, checkDate: event.target.value })}
                          className={inputClassName} required />
                      </TableCell>
                      <TableCell>
                        <label htmlFor={`edit-amount-${row.id}`} className="sr-only">Amount</label>
                        <input id={`edit-amount-${row.id}`} type="number" min="0" step="0.01" value={editing.amount}
                          onChange={(event) => setEditing({ ...editing, amount: event.target.value })}
                          className={inputClassName} required />
                      </TableCell>
                      <TableCell>
                        <div className="flex min-w-72 items-center gap-2">
                          <div>
                            <label htmlFor={`edit-period-start-${row.id}`} className="sr-only">Pay period start</label>
                            <input id={`edit-period-start-${row.id}`} type="date" value={editing.payPeriodStart}
                              onChange={(event) => setEditing({ ...editing, payPeriodStart: event.target.value })}
                              className={inputClassName} required />
                          </div>
                          <span className="text-gray-500">to</span>
                          <div>
                            <label htmlFor={`edit-period-end-${row.id}`} className="sr-only">Pay period end</label>
                            <input id={`edit-period-end-${row.id}`} type="date" value={editing.payPeriodEnd}
                              onChange={(event) => setEditing({ ...editing, payPeriodEnd: event.target.value })}
                              className={inputClassName} required />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={saving} onClick={saveEdit}>
                            {saving ? "Saving…" : "Save"}
                          </Button>
                          <Button type="button" size="sm" variant="secondary" disabled={saving}
                            onClick={() => { setEditing(null); setEditError(""); }}>Cancel</Button>
                        </div>
                        {editError ? <p role="alert" className="mt-2 min-w-48 text-sm text-red-600">{editError}</p> : null}
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={row.id}>
                      <TableCell>{row.payrollType}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {checkDateFormatter.format(new Date(`${row.checkDate}T00:00:00.000Z`))}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium">
                        {moneyFormatter.format(Number(row.amount))}
                      </TableCell>
                      <TableCell>{row.payPeriod}</TableCell>
                      <TableCell>
                        <Button type="button" size="sm" variant="secondary" disabled={saving}
                          onClick={() => startEditing(row)}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  )
                )
              )}
            </TableBody>
          </Table>
        </form>
      </CardContent>
    </Card>
  );
}
