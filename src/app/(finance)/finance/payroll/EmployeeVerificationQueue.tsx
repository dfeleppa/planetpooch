"use client";

import { useState } from "react";

export type VerificationDay = {
  date: string;
  label: string;
  employees: {
    name: string;
    expectedCashCents: number;
    record?: { countedCashCents: number; expectedCashCents: number; note: string };
  }[];
};

function formatCash(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function EmployeeVerificationQueue({ days, selectedEmployee, initialDate, busy, onSelect, onDayChange, onWeeklyReview }: {
  days: VerificationDay[];
  selectedEmployee: string;
  initialDate?: string | null;
  busy: boolean;
  onSelect: (name: string, date: string) => void;
  onDayChange: () => void;
  onWeeklyReview: () => void;
}) {
  const [selectedDate, setSelectedDate] = useState(() => {
    if (initialDate && days.some((day) => day.date === initialDate)) return initialDate;
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    return days.some((day) => day.date === today) ? today : days[0]?.date ?? "";
  });
  const day = days.find((item) => item.date === selectedDate);
  const employees = day?.employees ?? [];
  const isVerified = (employee: VerificationDay["employees"][number]) => Boolean(employee.record && employee.record.expectedCashCents === employee.expectedCashCents);
  const verified = employees.filter(isVerified).length;
  const ordered = [...employees].sort((a, b) => Number(isVerified(a)) - Number(isVerified(b)) || a.name.localeCompare(b.name));

  return <section aria-label="Daily employee checklist" className="space-y-4 rounded-xl border border-pp-line bg-pp-surface p-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <label className="text-sm font-medium text-gray-800">Day to verify
        <select value={selectedDate} disabled={busy} onChange={(event) => { setSelectedDate(event.target.value); onDayChange(); }} className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm">
          {days.map((item) => <option key={item.date} value={item.date}>{item.label}</option>)}
        </select>
      </label>
      <p role="status" className="text-sm font-semibold text-gray-700">{verified} of {employees.length} employees verified for this day</p>
    </div>
    <p className="text-sm text-gray-600">Select an employee, review their appointments, enter the cash you counted, and save verification. Employees needing attention appear first. Verify $0 cash days too.</p>
    {employees.length === 0 ? <p className="text-sm text-gray-600">No saved appointments for this day. Choose another day or check the week’s payroll import.</p> : <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {ordered.map((employee) => {
        const differenceCents = isVerified(employee) ? employee.record!.countedCashCents - employee.expectedCashCents : null;
        return <button key={employee.name} type="button" disabled={busy} aria-pressed={selectedEmployee === employee.name} onClick={() => onSelect(employee.name, selectedDate)} className={`rounded-lg border p-3 text-left disabled:opacity-50 ${selectedEmployee === employee.name ? "border-pp-accent bg-pp-mint" : "border-pp-line bg-white hover:border-pp-accent"}`}>
          <span className="block font-semibold text-gray-900">{employee.name}</span>
          <span className={`mt-1 block text-sm ${isVerified(employee) ? "text-green-800" : "text-amber-800"}`}>{isVerified(employee) ? "✓ Verified · Review / edit" : employee.record ? "Needs update · Cash total changed" : "Not verified · Start here"}</span>
          <span className={`mt-1 block text-xs font-semibold ${differenceCents === null || differenceCents === 0 ? "text-gray-600" : differenceCents > 0 ? "text-green-800" : "text-red-700"}`}>
            {differenceCents === null ? `Expected cash: ${formatCash(employee.expectedCashCents)}` : differenceCents > 0 ? `Over: ${formatCash(differenceCents)}` : differenceCents < 0 ? `Short: ${formatCash(Math.abs(differenceCents))}` : "Even: $0.00"}
          </span>
        </button>;
      })}
    </div>}
    {employees.length > 0 && verified === employees.length && <p className="text-sm font-medium text-green-800">This day is verified. Choose another day, or review the whole week.</p>}
    <button type="button" disabled={busy} onClick={onWeeklyReview} className="text-sm font-semibold text-pp-accent underline disabled:opacity-50">Review weekly progress & closeout →</button>
  </section>;
}
