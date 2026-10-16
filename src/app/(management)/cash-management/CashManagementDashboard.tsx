"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SafeBalanceVerification } from "./SafeBalanceVerification";

type Deposit = { id: string; amountCents: number; depositedAt: string };
type MobileSummary = {
  payrollCents: number;
  bankedCents: number;
  onHandCents: number;
  recentDeposits: Deposit[];
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function CashManagementDashboard({ mobile, safeCents, initialCountedCents }: { mobile: MobileSummary; safeCents: number; initialCountedCents: number | null }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [countedSafeCents, setCountedSafeCents] = useState(initialCountedCents);
  const requestId = useRef<string | null>(null);

  async function recordDeposit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
      setError("Enter an amount in dollars and cents.");
      return;
    }
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > mobile.onHandCents) {
      setError("Enter an amount above zero and no more than the cash on hand.");
      return;
    }
    setSaving(true);
    try {
      requestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/cash-management/deposits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "mobile-grooming", amountCents, requestId: requestId.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to record deposit.");
      requestId.current = null;
      setAmount("");
      setSuccess(`${money(amountCents)} bank deposit recorded.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record deposit.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cash Management</h1>
        <p className="mt-1 text-gray-500">Pet Resort and Mobile Grooming cash in one place</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Pet Resort Deposit</h2>
          <p className="mt-4 text-3xl font-bold text-gray-900">Pending</p>
          <p className="mt-2 text-sm text-gray-500">Cash source will appear when the Pet Resort cash page is built.</p>
          <button type="button" disabled className="mt-5 rounded-lg bg-gray-100 px-4 py-2 text-sm font-semibold text-gray-500">Deposit unavailable</button>
        </section>
        <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Mobile Grooming Deposit</h2>
          <p className="mt-4 text-3xl font-bold text-gray-900">{money(mobile.onHandCents)}</p>
          <p className="mt-2 text-sm text-gray-500">Cash on hand from completed payroll closeouts, less bank deposits recorded here.</p>
          <form onSubmit={recordDeposit} className="mt-5 space-y-3">
            <label htmlFor="mobile-deposit-amount" className="block text-sm font-medium text-gray-700">Amount to deposit at bank</label>
            <div className="flex flex-wrap gap-2">
              <input id="mobile-deposit-amount" type="number" min="0.01" max={Math.max(0, mobile.onHandCents / 100)} step="0.01" required value={amount} onChange={(event) => { setAmount(event.target.value); requestId.current = null; }} placeholder="0.00" className="w-36 rounded-lg border border-pp-line px-3 py-2 text-sm text-gray-900" />
              <button type="submit" disabled={saving || mobile.onHandCents <= 0} className="rounded-lg bg-pp-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Recording…" : "Record bank deposit"}</button>
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {success && <p role="status" className="text-sm text-green-700">{success}</p>}
          </form>
        </section>
        <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Safe</h2>
          <p className="mt-4 text-3xl font-bold text-gray-900">{money(countedSafeCents ?? safeCents)}</p>
          <p className="mt-2 text-sm text-gray-500">{countedSafeCents === null ? "Target safe balance" : `Last verified safe balance · Target ${money(safeCents)}`}</p>
          {countedSafeCents !== null && countedSafeCents !== safeCents && <p className="mt-1 text-sm font-medium text-amber-800">{money(Math.abs(countedSafeCents - safeCents))} {countedSafeCents > safeCents ? "over target" : "under target"}</p>}
        </section>
      </div>
      <SafeBalanceVerification expectedCents={safeCents} onLatestCountChange={setCountedSafeCents} />
      <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Mobile Grooming activity</h2>
        <p className="mt-2 text-sm text-gray-600">Completed payroll deposits: {money(mobile.payrollCents)} · Banked: {money(mobile.bankedCents)}</p>
        {mobile.recentDeposits.length > 0 ? (
          <ul className="mt-4 divide-y divide-pp-line">
            {mobile.recentDeposits.map((deposit) => (
              <li key={deposit.id} className="flex justify-between gap-4 py-3 text-sm text-gray-700">
                <span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(deposit.depositedAt))}</span>
                <span className="font-semibold">Bank deposit · {money(deposit.amountCents)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-4 text-sm text-gray-500">No bank deposits recorded yet.</p>}
      </section>
    </div>
  );
}
