"use client";

import { type FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { allocateTipCents } from "@/lib/resort-tips";
import { saveResortTips } from "./actions";

type Employee = { id: string; name: string };
type Run = { id: string; payDate: string; periodStart: string; periodEnd: string; totalCents: number;
  allocations: { id: string; name: string; hoursHundredths: number; amountCents: number }[] };
const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const displayDate = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500";

export function ResortTips({ employees, runs }: { employees: Employee[]; runs: Run[] }) {
  const router = useRouter();
  const [totalTips, setTotalTips] = useState("");
  const [payDate, setPayDate] = useState("");
  const [periodStartMonth, setPeriodStartMonth] = useState("");
  const [periodEndMonth, setPeriodEndMonth] = useState("");
  const [hours, setHours] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const calculation = useMemo(() => {
    if (!/^\d+(\.\d{1,2})?$/.test(totalTips)) return null;
    const totalCents = Math.round(Number(totalTips) * 100);
    const rows = employees.map((employee) => ({ employeeId: employee.id, hoursHundredths: Math.round(Number(hours[employee.id] || 0) * 100) }));
    if (rows.some((row) => !Number.isSafeInteger(row.hoursHundredths) || row.hoursHundredths < 0)) return null;
    try { return allocateTipCents(totalCents, rows); } catch { return null; }
  }, [employees, hours, totalTips]);
  const allocated = new Map(calculation?.map((row) => [row.employeeId, row.amountCents]));
  const totalHours = employees.reduce((sum, employee) => sum + (Number(hours[employee.id]) || 0), 0);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      const periodStart = `${periodStartMonth}-01`;
      const [endYear, endMonth] = periodEndMonth.split("-").map(Number);
      const periodEnd = new Date(Date.UTC(endYear, endMonth, 0)).toISOString().slice(0, 10);
      const result = await saveResortTips({ payDate, periodStart, periodEnd, totalTips,
        hours: employees.map((employee) => ({ employeeId: employee.id, hours: hours[employee.id] || "0" })) });
      if (!result.ok) { setError(result.error); return; }
      setTotalTips(""); setPayDate(""); setPeriodStartMonth(""); setPeriodEndMonth(""); setHours({});
      router.refresh();
    } catch { setError("Could not save the tip record. Please try again."); }
    finally { setSaving(false); }
  }

  return <div className="space-y-6">
    <Card><CardContent className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-900">Paid tip records</h3>
      {runs.length === 0 ? <p className="text-sm text-gray-500">No tip payments recorded yet.</p> :
        <div className="space-y-2">{runs.map((run) => <details key={run.id} className="rounded-lg border border-gray-200 bg-white p-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-900">
            {displayDate(run.payDate)} · {money(run.totalCents)} · Pay period {displayDate(run.periodStart)}–{displayDate(run.periodEnd)}
          </summary>
          <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr className="border-b text-gray-600"><th className="pb-2">Employee</th><th className="pb-2 text-right">Hours</th><th className="pb-2 text-right">Tips paid</th></tr></thead>
            <tbody>{run.allocations.map((row) => <tr key={row.id} className="border-b last:border-0"><td className="py-2">{row.name}</td><td className="py-2 text-right">{(row.hoursHundredths / 100).toFixed(2)}</td><td className="py-2 text-right">{money(row.amountCents)}</td></tr>)}</tbody>
          </table></div>
        </details>)}</div>}
    </CardContent></Card>

    <Card><CardContent className="space-y-4">
      <div><h3 className="text-lg font-semibold text-gray-900">Tip calculator</h3><p className="text-sm text-gray-500">Enter each employee’s hours to divide the tip pool proportionally. Save the result when paid.</p></div>
      <form onSubmit={save} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium">Total tips ($)<input className={`${inputClass} mt-1`} type="number" min="0.01" step="0.01" required value={totalTips} onChange={(event) => setTotalTips(event.target.value)} /></label>
          <label className="text-sm font-medium">Pay date<input className={`${inputClass} mt-1`} type="date" required value={payDate} onChange={(event) => setPayDate(event.target.value)} /></label>
          <label className="text-sm font-medium">Period start month<input className={`${inputClass} mt-1`} type="month" required value={periodStartMonth} onChange={(event) => setPeriodStartMonth(event.target.value)} /></label>
          <label className="text-sm font-medium">Period end month<input className={`${inputClass} mt-1`} type="month" required min={periodStartMonth || undefined} value={periodEndMonth} onChange={(event) => setPeriodEndMonth(event.target.value)} /></label>
        </div>
        {employees.length === 0 ? <p className="text-sm text-gray-500">No active Resort employees are available.</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead><tr className="border-b text-gray-600"><th className="py-2">Resort employee</th><th className="py-2">Hours worked</th><th className="py-2 text-right">Share of tips</th></tr></thead>
          <tbody>{employees.map((employee) => <tr key={employee.id} className="border-b"><td className="py-2 font-medium">{employee.name}</td><td className="py-2"><label className="sr-only" htmlFor={`hours-${employee.id}`}>{employee.name} hours worked</label><input id={`hours-${employee.id}`} className={`${inputClass} max-w-36`} type="number" min="0" step="0.01" value={hours[employee.id] ?? ""} placeholder="0" onChange={(event) => setHours({ ...hours, [employee.id]: event.target.value })} /></td><td className="py-2 text-right">{money(allocated.get(employee.id) ?? 0)}</td></tr>)}</tbody>
          <tfoot><tr className="font-semibold"><td className="pt-3">Total</td><td className="pt-3">{totalHours.toFixed(2)} hours</td><td className="pt-3 text-right">{calculation ? money(calculation.reduce((sum, row) => sum + row.amountCents, 0)) : "—"}</td></tr></tfoot>
        </table></div>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={saving || !calculation || !totalTips || employees.length === 0}>{saving ? "Saving…" : "Save paid tips"}</Button>
      </form>
    </CardContent></Card>
  </div>;
}
