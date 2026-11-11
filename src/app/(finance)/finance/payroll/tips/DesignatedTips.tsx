"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { saveDesignatedTip } from "./actions";

type Record = { id: string; periodStart: string; periodEnd: string; paidDate: string; amountCents: number };
const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const displayDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`));
const inputClass = "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";

export function DesignatedTips({ employee, nextStart, records }: {
  employee: { id: string; name: string };
  nextStart: string;
  records: Record[];
}) {
  const [start, setStart] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const periodStart = start ?? nextStart;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true);
    setError("");
    try {
      const result = await saveDesignatedTip({
        employeeId: employee.id,
        periodStart,
        periodEnd: String(fields.get("periodEnd")),
        paidDate: String(fields.get("paidDate")),
        amount: String(fields.get("amount")),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      form.reset();
      setStart(undefined);
    } catch {
      setError("Could not save the tip record. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return <Card><CardContent className="space-y-4">
    <h4 id={`tip-${employee.id}`} className="font-semibold">{employee.name}</h4>
    <form aria-labelledby={`tip-${employee.id}`} onSubmit={save}>
      <fieldset disabled={saving} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Pay period start<input className={inputClass} type="date" required value={periodStart} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="text-sm font-medium">Pay period end<input className={inputClass} name="periodEnd" type="date" min={periodStart || undefined} required /></label>
          <label className="text-sm font-medium">Amount ($)<input className={inputClass} name="amount" type="number" min="0.01" step="0.01" required /></label>
          <label className="text-sm font-medium">Paid date<input className={inputClass} name="paidDate" type="date" required /></label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save paid tip"}</Button>
      </fieldset>
    </form>
    {records.length > 0 && <details className="border-t pt-3 text-sm">
      <summary className="cursor-pointer font-medium">Paid tip history</summary>
      <ul className="mt-2 divide-y">
        {records.map((tip) => <li key={tip.id} className="py-2">
          {displayDate(tip.periodStart)} – {displayDate(tip.periodEnd)} · {money.format(tip.amountCents / 100)} · Paid {displayDate(tip.paidDate)}
        </li>)}
      </ul>
    </details>}
  </CardContent></Card>;
}
