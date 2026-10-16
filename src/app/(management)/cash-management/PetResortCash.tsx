"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Deposit = { id: string; amountCents: number; depositedAt: string };
export type PetResortSummary = {
  receivedCents: number;
  bankedCents: number;
  onHandCents: number;
  transactionCount: number;
  recentDeposits: Deposit[];
};

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

export function PetResortCash({ summary }: { summary: PetResortSummary }) {
  const router = useRouter();
  const [importFile, setImportFile] = useState<File | null>(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const importInput = useRef<HTMLInputElement | null>(null);

  async function importCash(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!importFile) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const text = await importFile.text();
      const body = JSON.parse(text);
      const response = await fetch("/api/cash-management/pet-resort-import", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to import cash transactions.");
      setMessage(`${result.inserted} cash transactions imported; ${result.skipped} already present.`);
      setImportFile(null);
      if (importInput.current) importInput.current.value = "";
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to import cash transactions.");
    } finally { setSaving(false); }
  }

  async function recordDeposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) { setError("Enter an amount in dollars and cents."); return; }
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > summary.onHandCents) {
      setError("Enter an amount above zero and no more than Pet Resort cash on hand."); return;
    }
    setSaving(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/cash-management/deposits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "pet-resort", amountCents, requestId: requestId.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to record bank deposit.");
      requestId.current = null; setAmount("");
      setMessage(`${money(amountCents)} Pet Resort bank deposit recorded.`);
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to record bank deposit."); }
    finally { setSaving(false); }
  }

  return <>
    <p className="mt-4 text-3xl font-bold text-gray-900">{money(summary.onHandCents)}</p>
    <p className="mt-2 text-sm text-gray-500">Cash received from MoeGo, less bank deposits recorded here.</p>
    <form onSubmit={importCash} className="mt-5 space-y-2">
      <label htmlFor="pet-resort-cash-import" className="block text-sm font-medium text-gray-700">MoeGo cash import JSON</label>
      <input id="pet-resort-cash-import" ref={importInput} type="file" accept=".json,application/json" required
        onChange={(event) => setImportFile(event.target.files?.[0] ?? null)} className="block w-full text-sm text-gray-700" />
      <button type="submit" disabled={saving || !importFile} className="rounded-lg bg-pp-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Import cash transactions</button>
    </form>
    <form onSubmit={recordDeposit} className="mt-5 space-y-2">
      <label htmlFor="pet-resort-deposit-amount" className="block text-sm font-medium text-gray-700">Amount taken to bank</label>
      <div className="flex flex-wrap gap-2">
        <input id="pet-resort-deposit-amount" type="number" min="0.01" max={Math.max(0, summary.onHandCents / 100)} step="0.01" required
          value={amount} onChange={(event) => { setAmount(event.target.value); requestId.current = null; }} placeholder="0.00"
          className="w-36 rounded-lg border border-pp-line px-3 py-2 text-sm text-gray-900" />
        <button type="submit" disabled={saving || summary.onHandCents <= 0} className="rounded-lg bg-pp-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Record bank deposit</button>
      </div>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="mt-3 text-sm text-green-700">{message}</p>}
  </>;
}
