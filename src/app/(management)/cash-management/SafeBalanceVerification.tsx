"use client";

import { useEffect, useState } from "react";

type Entry = {
  id: string;
  expectedCents: number;
  countedCents: number;
  varianceCents: number;
  note: string;
  verifiedByName: string;
  verifiedAt: string;
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
const varianceLabel = (cents: number) => cents > 0 ? `${money(cents)} overage` : cents < 0 ? `${money(-cents)} shortage` : "Balanced";

function parseCents(value: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount <= 2_147_483_647 ? amount : null;
}

export function SafeBalanceVerification({ expectedCents, onLatestCountChange }: { expectedCents: number; onLatestCountChange: (countedCents: number | null) => void }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/cash-management/safe-verifications", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load safe verifications.");
        if (active) {
          setEntries(result.entries);
          onLatestCountChange(result.entries[0]?.countedCents ?? null);
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load safe verifications."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [onLatestCountChange]);

  const countedCents = parseCents(counted);
  const varianceCents = countedCents === null ? null : countedCents - expectedCents;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    if (countedCents === null) { setError("Enter a valid safe count in dollars and cents."); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/cash-management/safe-verifications", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countedCents, note }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save verification.");
      setEntries((current) => [result.entry, ...current].slice(0, 50));
      onLatestCountChange(result.entry.countedCents);
      setCounted(""); setNote("");
      setSuccess("Safe balance verification saved.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save verification.");
    } finally { setSaving(false); }
  }

  return <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
    <h2 className="text-lg font-semibold text-gray-900">Verify safe balance</h2>
    <p className="mt-1 text-sm text-gray-600">Count the cash in the safe and compare it with the {money(expectedCents)} target.</p>
    {loading ? <p className="mt-4 text-sm text-gray-500">Loading verifications…</p> : <form onSubmit={(event) => void save(event)} className="mt-4 space-y-3">
      <label className="block max-w-xs text-sm font-medium text-gray-700">Counted safe balance
        <input type="text" inputMode="decimal" value={counted} onChange={(event) => setCounted(event.target.value)} placeholder="0.00" required className="mt-1 block w-full rounded-lg border border-pp-line px-3 py-2" />
      </label>
      {varianceCents !== null && <p className={`w-fit rounded-lg px-3 py-2 text-sm font-semibold ${varianceCents === 0 ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-900"}`}>Difference: {varianceLabel(varianceCents)}</p>}
      <label className="block text-sm font-medium text-gray-700">Note <span className="font-normal text-gray-500">(optional)</span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} placeholder="Explain an overage or shortage" className="mt-1 block w-full rounded-lg border border-pp-line px-3 py-2" />
      </label>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="text-sm text-green-700">{success}</p>}
      <button type="submit" disabled={saving || countedCents === null} className="rounded-lg bg-pp-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Saving…" : "Save verification"}</button>
    </form>}
    <h3 className="mt-8 font-semibold text-gray-900">Verification history</h3>
    {!loading && entries.length === 0 && <p className="mt-2 text-sm text-gray-500">No safe balance verifications recorded yet.</p>}
    {entries.length > 0 && <div className="mt-3 space-y-3">{entries.map((entry) => <article key={entry.id} className="rounded-lg border border-pp-line p-4 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><strong>{money(entry.countedCents)} counted</strong><span className={entry.varianceCents === 0 ? "text-green-700" : "text-amber-800"}>{varianceLabel(entry.varianceCents)}</span></div>
      <p className="mt-1 text-gray-600">Expected {money(entry.expectedCents)} · {date(entry.verifiedAt)} · {entry.verifiedByName}</p>
      {entry.note && <p className="mt-2 whitespace-pre-wrap text-gray-700">{entry.note}</p>}
    </article>)}</div>}
  </section>;
}
