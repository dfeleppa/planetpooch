"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { readApiResponse } from "@/lib/api-response";
import type { MobileCashLedgerEntry } from "@/lib/cash-management";

export function MobileAdjustmentActions({ entry }: { entry: MobileCashLedgerEntry }) {
  const router = useRouter();
  const [mode, setMode] = useState<"edit" | "delete" | null>(null);
  const [direction, setDirection] = useState(entry.amountCents > 0 ? "add" : "remove");
  const [amount, setAmount] = useState((Math.abs(entry.amountCents) / 100).toFixed(2));
  const [note, setNote] = useState(entry.detail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    const amountCents = Math.round(Number(amount) * 100);
    if (mode === "edit" && (!/^\d+(?:\.\d{1,2})?$/.test(amount) || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647 || !note.trim() || note.trim().length > 1000)) {
      setError("Enter a valid amount and reason (up to 1,000 characters)."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cash-management/mobile-grooming-adjustments", {
        method: mode === "delete" ? "DELETE" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: entry.id.slice("manual-".length), direction, amountCents, note,
          original: { amountCents: entry.amountCents, note: entry.detail } }),
      });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error ?? "Unable to change adjustment.");
      setMessage(mode === "delete" ? "Adjustment deleted." : "Adjustment updated.");
      setMode(null); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to change adjustment."); }
    finally { setBusy(false); }
  }

  const field = "mt-1 block w-full rounded-lg border border-pp-line bg-white px-3 py-2 text-sm";
  return <div className="mt-2 block">
    {mode ? <form onSubmit={submit} className="space-y-3 rounded-lg border border-pp-line bg-gray-50 p-3">
      {mode === "edit" ? <>
        <label className="block">Adjustment<select className={field} value={direction} onChange={(event) => setDirection(event.target.value)} disabled={busy}><option value="add">Add cash</option><option value="remove">Remove cash</option></select></label>
        <label className="block">Amount ($)<input className={field} type="number" min="0.01" max="21474836.47" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} disabled={busy} /></label>
        <label className="block">Reason<textarea className={field} rows={2} maxLength={1000} required value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} /></label>
      </> : <p>Delete this cash adjustment? Its {entry.amountCents < 0 ? "deduction" : "addition"} will be removed from the cash balance. This cannot be undone.</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <span className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={`rounded-lg px-3 py-2 font-semibold text-white disabled:opacity-50 ${mode === "delete" ? "bg-red-700" : "bg-pp-accent"}`}>{busy ? "Saving…" : mode === "delete" ? "Delete adjustment" : "Save changes"}</button>
        <button type="button" disabled={busy} onClick={() => { setMode(null); setError(""); }} className="rounded-lg border border-pp-line bg-white px-3 py-2">Cancel</button>
      </span>
    </form> : <span className="flex gap-3">
      <button type="button" onClick={() => { setDirection(entry.amountCents > 0 ? "add" : "remove"); setAmount((Math.abs(entry.amountCents) / 100).toFixed(2)); setNote(entry.detail); setMessage(""); setMode("edit"); }} className="font-medium text-pp-accent underline underline-offset-2">Edit</button>
      <button type="button" onClick={() => { setMessage(""); setMode("delete"); }} className="font-medium text-red-700 underline underline-offset-2">Delete</button>
    </span>}
    {message && <span role="status" className="mt-2 block text-green-800">{message}</span>}
  </div>;
}
