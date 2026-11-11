"use client";

import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deleteDesignatedTip, saveDesignatedTip } from "./actions";

type TipRecord = { id: string; periodStart: string; periodEnd: string; paidDate: string; amountCents: number };
const dateFormat = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", dateStyle: "medium" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const displayDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00Z`));
const tipSummary = (tip: TipRecord) =>
  `${displayDate(tip.periodStart)} – ${displayDate(tip.periodEnd)} · ${money.format(tip.amountCents / 100)} · Paid ${displayDate(tip.paidDate)}`;
const inputClass = "mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm";

export function DesignatedTips({ employee, nextStart, records }: {
  employee: { id: string; name: string };
  nextStart: string;
  records: TipRecord[];
}) {
  const [editingId, setEditingId] = useState<string>();
  const [deletingId, setDeletingId] = useState<string>();
  const [deleteError, setDeleteError] = useState("");
  const headingId = `tip-${employee.id}`;

  async function remove(tip: TipRecord) {
    if (!window.confirm(`Delete this saved tip for ${employee.name}?\n\n${tipSummary(tip)}\n\nThis cannot be undone.`)) return;
    setDeletingId(tip.id);
    setDeleteError("");
    try {
      const result = await deleteDesignatedTip({
        employeeId: employee.id,
        tipId: tip.id,
        periodStart: tip.periodStart,
        periodEnd: tip.periodEnd,
        paidDate: tip.paidDate,
        amountCents: tip.amountCents,
      });
      if (!result.ok) setDeleteError(result.error);
    } catch {
      setDeleteError("Could not delete the tip record. Please try again.");
    } finally {
      setDeletingId(undefined);
    }
  }

  return <Card><CardContent className="space-y-4">
    <h4 id={headingId} className="font-semibold">{employee.name}</h4>
    <TipForm employeeId={employee.id} nextStart={nextStart} labelId={headingId} />
    {deleteError && <p role="alert" className="text-sm text-red-600">{deleteError}</p>}
    <section aria-labelledby={`tip-history-${employee.id}`} className="border-t pt-3 text-sm">
      <h5 id={`tip-history-${employee.id}`} className="font-medium">Paid tip history</h5>
      {records.length === 0 ? <p className="mt-2 text-gray-500">No tips recorded yet.</p> : <ul className="mt-2 divide-y">
        {records.map((tip) => <li key={tip.id} className="space-y-3 py-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id={`record-${tip.id}`}>{tipSummary(tip)}</span>
            {editingId !== tip.id && <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" disabled={Boolean(deletingId)}
                aria-describedby={`record-${tip.id}`} onClick={() => setEditingId(tip.id)}>Edit</Button>
              <Button type="button" variant="danger" size="sm" disabled={Boolean(deletingId)}
                aria-describedby={`record-${tip.id}`} onClick={() => remove(tip)}>
                {deletingId === tip.id ? "Deleting…" : "Delete"}
              </Button>
            </div>}
          </div>
          {editingId === tip.id && <TipForm employeeId={employee.id} nextStart={nextStart} record={tip}
            labelId={`${headingId} record-${tip.id}`} onClose={() => setEditingId(undefined)} />}
        </li>)}
      </ul>}
    </section>
  </CardContent></Card>;
}

function TipForm({ employeeId, nextStart, labelId, record, onClose }: {
  employeeId: string;
  nextStart: string;
  labelId: string;
  record?: TipRecord;
  onClose?: () => void;
}) {
  const [start, setStart] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const periodStart = start ?? record?.periodStart ?? nextStart;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setSaving(true);
    setError("");
    try {
      const result = await saveDesignatedTip({
        employeeId,
        tipId: record?.id,
        periodStart,
        periodEnd: String(fields.get("periodEnd")),
        paidDate: String(fields.get("paidDate")),
        amount: String(fields.get("amount")),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (onClose) {
        onClose();
      } else {
        form.reset();
        setStart(undefined);
      }
    } catch {
      setError("Could not save the tip record. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form aria-labelledby={labelId} onSubmit={save}>
      <fieldset disabled={saving} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Pay period start<input className={inputClass} type="date" required value={periodStart} onChange={(event) => setStart(event.target.value)} /></label>
          <label className="text-sm font-medium">Pay period end<input className={inputClass} name="periodEnd" type="date" min={periodStart || undefined} defaultValue={record?.periodEnd} required /></label>
          <label className="text-sm font-medium">Amount ($)<input className={inputClass} name="amount" type="number" min="0.01" step="0.01" defaultValue={record ? (record.amountCents / 100).toFixed(2) : undefined} required /></label>
          <label className="text-sm font-medium">Paid date<input className={inputClass} name="paidDate" type="date" defaultValue={record?.paidDate} required /></label>
        </div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : record ? "Save changes" : "Save paid tip"}</Button>
          {onClose && <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>}
        </div>
      </fieldset>
    </form>
  );
}
