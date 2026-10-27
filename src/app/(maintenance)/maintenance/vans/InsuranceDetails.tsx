"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Insurance = { carrier: string; deductible: string; premium: string };
const money = (value: string) => value ? Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "—";

export function InsuranceDetails({ number, insurance, expiry, canEdit }: {
  number: number; insurance: Insurance; expiry: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(insurance);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`/api/maintenance/vans/${number}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ insuranceOnly: true, insuranceCarrier: draft.carrier, insuranceDeductible: draft.deductible, insurancePremium: draft.premium }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save insurance");
      setMessage(`Van ${number} insurance saved.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save insurance");
    } finally { setSaving(false); }
  }
  return <details className="min-w-56 max-w-72">
    <summary className="cursor-pointer text-blue-700">
      <span>{insurance.carrier || "Insurance details"}</span>
      <span className="mt-1 block text-xs text-gray-600">Premium {money(insurance.premium)}</span>
    </summary>
    <form onSubmit={save} aria-label={`Van ${number} insurance`} className="mt-3 grid gap-3 rounded-lg bg-gray-50 p-3">
      {([ ["carrier", "Insurance carrier"], ["deductible", "Deductible ($)"], ["premium", "Premium ($)"] ] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-xs text-gray-600">
        {label}
        {canEdit ? <input disabled={saving} type={key === "carrier" ? "text" : "number"} min={key === "carrier" ? undefined : "0"} step={key === "carrier" ? undefined : "0.01"} className="w-full min-w-0 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 disabled:opacity-50" value={draft[key]} onChange={event => setDraft(current => ({ ...current, [key]: event.target.value }))} /> : <span className="text-sm text-gray-900">{key === "carrier" ? insurance.carrier || "—" : money(insurance[key])}</span>}
      </label>)}
      <div className="text-xs text-gray-600">Insurance expires<span className="mt-1 block text-sm text-gray-900">{expiry || "—"}</span></div>
      {canEdit && <button type="submit" disabled={saving} className="rounded bg-pp-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Save insurance"}</button>}
      {message && <p role="status" className="text-xs text-gray-700">{message}</p>}
    </form>
  </details>;
}
