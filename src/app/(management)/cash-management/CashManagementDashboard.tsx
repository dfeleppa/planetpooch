"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SafeBalanceVerification } from "./SafeBalanceVerification";
import { PetResortCash, type PetResortSummary } from "./PetResortCash";
import type { MobileCashLedgerEntry } from "@/lib/cash-management";

type DailyCash = PetResortSummary["recentDailyCash"][number];
type MobileSummary = {
  payrollCents: number;
  pendingCountedCents: number;
  bankedCents: number;
  adjustmentCents: number;
  onHandCents: number;
  ledger: MobileCashLedgerEntry[];
};
type CashView = "mobile-grooming" | "safe";
type DetailView = "actions" | "history";
type MobileHistoryFilter = "all" | MobileCashLedgerEntry["kind"];
type LatestSafeVerification = { countedCents: number; verifiedAt: string } | null;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export function CashManagementDashboard({ mobile, petResort, safeCents, initialSafeVerification }: { mobile: MobileSummary; petResort: PetResortSummary; safeCents: number; initialSafeVerification: LatestSafeVerification }) {
  const router = useRouter();
  const [cashView, setCashView] = useState<CashView | null>(null);
  const [detailView, setDetailView] = useState<DetailView>("actions");
  const [mobileHistoryFilter, setMobileHistoryFilter] = useState<MobileHistoryFilter>("all");
  const [petHistoryFilter, setPetHistoryFilter] = useState<"all" | "daily" | "bank">("all");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [adjustDirection, setAdjustDirection] = useState<"add" | "remove">("add");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustNote, setAdjustNote] = useState("");
  const [savingAdjustment, setSavingAdjustment] = useState(false);
  const [adjustError, setAdjustError] = useState("");
  const [adjustSuccess, setAdjustSuccess] = useState("");
  const [latestSafeVerification, setLatestSafeVerification] = useState(initialSafeVerification);
  const countedSafeCents = latestSafeVerification?.countedCents ?? null;
  const changeDrawerCents = countedSafeCents ?? safeCents;
  const totalSafeCents = changeDrawerCents + mobile.onHandCents + petResort.onHandCents;
  const [editingCash, setEditingCash] = useState<DailyCash | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editMessage, setEditMessage] = useState("");
  const requestId = useRef<string | null>(null);
  const adjustmentRequestId = useRef<string | null>(null);
  const visibleMobileLedger = mobileHistoryFilter === "all"
    ? mobile.ledger
    : mobile.ledger.filter((entry) => entry.kind === mobileHistoryFilter);

  function selectCashView(nextView: CashView) {
    setCashView(nextView);
    setDetailView("actions");
  }

  async function recordAdjustment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjustError(""); setAdjustSuccess("");
    if (!/^\d+(?:\.\d{1,2})?$/.test(adjustAmount)) {
      setAdjustError("Enter an amount in dollars and cents."); return;
    }
    const amountCents = Math.round(Number(adjustAmount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647 ||
        (adjustDirection === "remove" && amountCents > mobile.onHandCents)) {
      setAdjustError("Enter a valid amount no greater than cash on hand when removing cash."); return;
    }
    if (!adjustNote.trim() || adjustNote.trim().length > 1000) {
      setAdjustError("Enter a reason (up to 1,000 characters)."); return;
    }
    setSavingAdjustment(true);
    try {
      adjustmentRequestId.current ??= crypto.randomUUID();
      const response = await fetch("/api/cash-management/mobile-grooming-adjustments", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction: adjustDirection, amountCents, note: adjustNote,
          requestId: adjustmentRequestId.current }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to record adjustment.");
      adjustmentRequestId.current = null;
      setAdjustAmount(""); setAdjustNote("");
      setAdjustSuccess(`${money(amountCents)} cash adjustment recorded.`);
      router.refresh();
    } catch (cause) {
      setAdjustError(cause instanceof Error ? cause.message : "Unable to record adjustment.");
    } finally { setSavingAdjustment(false); }
  }

  function beginCashEdit(entry: DailyCash) {
    setEditingCash(entry);
    setEditDate(entry.cashDate);
    setEditAmount((entry.amountCents / 100).toFixed(2));
    setEditNote(entry.note);
    setEditError("");
    setEditMessage("");
  }

  async function saveCashEdit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingCash) return;
    setEditError("");
    if (!/^\d+(?:\.\d{1,2})?$/.test(editAmount)) {
      setEditError("Enter an amount in dollars and cents."); return;
    }
    const amountCents = Math.round(Number(editAmount) * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647) {
      setEditError("Enter a cash amount above zero."); return;
    }
    setEditSaving(true);
    try {
      const response = await fetch("/api/cash-management/pet-resort-daily-cash", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingCash.id, cashDate: editDate, amountCents, note: editNote,
          original: { cashDate: editingCash.cashDate, amountCents: editingCash.amountCents, note: editingCash.note } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to update daily cash.");
      setEditingCash(null);
      setEditMessage("Daily cash entry updated.");
      router.refresh();
    } catch (cause) {
      setEditError(cause instanceof Error ? cause.message : "Unable to update daily cash.");
    } finally { setEditSaving(false); }
  }

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
        <p className="mt-1 text-gray-500">Choose Mobile Grooming or Safe to open its tools.</p>
      </div>
      <section aria-labelledby="cash-areas-heading" className="space-y-3">
        <div>
          <h2 id="cash-areas-heading" className="text-lg font-semibold text-gray-900">Manage cash by location</h2>
          <p className="mt-1 text-sm text-gray-600">Select a card to open its cash actions and history.</p>
        </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {([
          { id: "mobile-grooming", label: "Mobile Grooming", balance: mobile.onHandCents },
          { id: "safe", label: "Safe", balance: totalSafeCents },
        ] as const).map((area) => (
          <button key={area.id} type="button" onClick={() => selectCashView(area.id)} aria-pressed={cashView === area.id}
            className={`flex min-h-40 w-full cursor-pointer flex-col rounded-xl border-2 p-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-accent ${cashView === area.id ? "border-pp-accent bg-pp-accent-soft" : "border-pp-line bg-white hover:border-pp-accent hover:bg-pp-accent-soft"}`}>
            <span className="text-sm font-semibold text-gray-900">{area.label}</span>
            <span className="mt-1 text-xl font-bold tabular-nums text-gray-900">{money(area.balance)}</span>
            <span className="mt-1 text-xs text-gray-500">{area.id === "safe" ? "Change drawer + Mobile Grooming + Pet Resort" : "Cash on hand"}</span>
            <span className="mt-auto flex items-center justify-between pt-4 text-sm font-semibold text-pp-accent">
              {cashView === area.id ? "Selected" : area.id === "safe" ? "Manage safe" : "Manage cash"}
              <span aria-hidden="true">{cashView === area.id ? "↓" : "→"}</span>
            </span>
          </button>
        ))}
      </div>
      </section>
      {cashView === "mobile-grooming" && (
        <section aria-labelledby="employee-verification-heading" className="rounded-xl border border-pp-accent-line bg-pp-accent-soft p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-pp-accent">Mobile Grooming</p>
          <h2 id="employee-verification-heading" className="mt-1 text-lg font-semibold text-gray-900">Employee verification & weekly closeout</h2>
          <p className="mt-2 text-sm text-gray-700">Verify each employee’s cash daily. Review payouts and count the remaining cash at the end of the week.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href="/cash-management/mobile-grooming/reconciliation" className="rounded-lg bg-pp-accent px-4 py-3 text-sm font-semibold text-white">1. Verify employees for the day →</Link>
            <Link href="/cash-management/mobile-grooming/reconciliation?view=weekly" className="rounded-lg border border-pp-accent-line bg-white px-4 py-3 text-sm font-semibold text-pp-accent">2. Review & close a week →</Link>
          </div>
          <p className="mt-3 text-xs text-gray-600">Manage bank deposits and cash adjustments under Safe.</p>
        </section>
      )}
      {cashView === "safe" && <nav aria-label="Cash view" className="flex flex-wrap items-center gap-2 border-b border-pp-line pb-3">
        <p className="mr-auto w-full text-sm font-semibold text-gray-900 sm:w-auto" role="status">Safe · {detailView === "actions" ? "Actions" : "History"}</p>
        {(["actions", "history"] as const).map((section) => (
          <button key={section} type="button" onClick={() => setDetailView(section)} aria-pressed={detailView === section}
            className={`min-h-11 cursor-pointer rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pp-accent ${detailView === section ? "border-pp-accent bg-pp-accent text-white" : "border-pp-line bg-white text-gray-700 hover:bg-gray-100"}`}>
            {section === "actions" ? "Manage safe" : "History"}
          </button>
        ))}
      </nav>}
      <div className={cashView === "safe" && detailView === "actions" ? "block" : "hidden"}>
        <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Pet Resort cash</h2>
          <PetResortCash summary={petResort} />
        </section>
      </div>
      <div className={cashView === "safe" && detailView === "actions" ? "block" : "hidden"}>
        <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Mobile Grooming cash</h2>
          <p className="mt-4 text-3xl font-bold text-gray-900">{money(mobile.onHandCents)}</p>
          <p className="mt-2 text-sm text-gray-500">Completed week net cash, closeout and cash adjustments, plus counted cash awaiting closeout, less bank deposits recorded here.</p>
          {mobile.pendingCountedCents > 0 && <p className="mt-1 text-sm text-amber-800">Includes {money(mobile.pendingCountedCents)} counted cash awaiting closeout; employee cash payouts are not yet deducted from that amount.</p>}
          <Link href="/cash-management/mobile-grooming/reconciliation" className="mt-5 block rounded-lg border border-pp-accent-line bg-pp-accent-soft px-4 py-3 text-sm font-semibold text-pp-accent hover:underline">
            Verify employees & close the week →
          </Link>
          <form onSubmit={recordDeposit} className="mt-5 space-y-3">
            <label htmlFor="mobile-deposit-amount" className="block text-sm font-medium text-gray-700">Amount to deposit at bank</label>
            <div className="flex flex-wrap gap-2">
              <input id="mobile-deposit-amount" type="number" min="0.01" max={Math.max(0, mobile.onHandCents / 100)} step="0.01" required value={amount} onChange={(event) => { setAmount(event.target.value); requestId.current = null; }} placeholder="0.00" className="w-36 rounded-lg border border-pp-line px-3 py-2 text-sm text-gray-900" />
              <button type="submit" disabled={saving || mobile.onHandCents <= 0} className="rounded-lg bg-pp-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Recording…" : "Record bank deposit"}</button>
            </div>
            {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
            {success && <p role="status" className="text-sm text-green-700">{success}</p>}
          </form>
          <details className="mt-5 border-t border-pp-line pt-5">
            <summary className="cursor-pointer text-sm font-semibold text-pp-accent">Adjust cash on hand</summary>
          <form onSubmit={recordAdjustment} className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-gray-700">Adjustment
                <select value={adjustDirection} onChange={(event) => { setAdjustDirection(event.target.value as "add" | "remove"); adjustmentRequestId.current = null; }} className="mt-1 block w-full rounded-lg border border-pp-line bg-white px-3 py-2 text-sm text-gray-900">
                  <option value="add">Add cash</option><option value="remove">Remove cash</option>
                </select>
              </label>
              <label className="block text-sm font-medium text-gray-700">Amount
                <input type="number" min="0.01" max={adjustDirection === "remove" ? Math.max(0, mobile.onHandCents / 100) : 21474836.47} step="0.01" required value={adjustAmount} onChange={(event) => { setAdjustAmount(event.target.value); adjustmentRequestId.current = null; }} placeholder="0.00" className="mt-1 block w-full rounded-lg border border-pp-line px-3 py-2 text-sm text-gray-900" />
              </label>
            </div>
            <label className="block text-sm font-medium text-gray-700">Reason
              <textarea rows={2} maxLength={1000} required value={adjustNote} onChange={(event) => { setAdjustNote(event.target.value); adjustmentRequestId.current = null; }} className="mt-1 block w-full rounded-lg border border-pp-line px-3 py-2 text-sm text-gray-900" />
            </label>
            <button type="submit" disabled={savingAdjustment || (adjustDirection === "remove" && mobile.onHandCents <= 0)} className="rounded-lg bg-pp-accent px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingAdjustment ? "Saving…" : "Record adjustment"}</button>
            {adjustError && <p role="alert" className="text-sm text-red-700">{adjustError}</p>}
            {adjustSuccess && <p role="status" className="text-sm text-green-700">{adjustSuccess}</p>}
          </form>
          </details>
        </section>
      </div>
      <div className={cashView === "safe" ? "space-y-4" : "hidden"}>
        <section className="rounded-xl border border-pp-line bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Change Drawer</h2>
          <p className="mt-4 text-3xl font-bold text-gray-900">{money(changeDrawerCents)}</p>
          <p className="mt-2 text-sm text-gray-500">{latestSafeVerification ? `Last verified ${new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(latestSafeVerification.verifiedAt))} ET · Target ${money(safeCents)}` : "Target change drawer balance · No verifications yet"}</p>
          {countedSafeCents !== null && countedSafeCents !== safeCents && <p className="mt-1 text-sm font-medium text-amber-800">{money(Math.abs(countedSafeCents - safeCents))} {countedSafeCents > safeCents ? "over target" : "under target"}</p>}
          <button type="button" onClick={() => setDetailView((current) => current === "history" ? "actions" : "history")} aria-expanded={detailView === "history"} className="mt-4 text-sm font-semibold text-pp-accent underline underline-offset-2">{detailView === "history" ? "Hide verification history" : "View verification history"}</button>
          <SafeBalanceVerification expectedCents={safeCents} onLatestVerificationChange={setLatestSafeVerification} mode={detailView} />
        </section>
      </div>
      <section className={cashView === "safe" && detailView === "history" ? "rounded-xl border border-pp-line bg-white p-6 shadow-sm" : "hidden"}>
        <h2 className="text-lg font-semibold text-gray-900">Pet Resort activity</h2>
        <p className="mt-2 text-sm text-gray-600">{petResort.transactionCount} imported cash transactions · MoeGo cash: {money(petResort.receivedCents)} · Daily cash: {money(petResort.dailyCashCents)} · Banked: {money(petResort.bankedCents)}</p>
        <label className="mt-5 block max-w-xs text-sm font-medium text-gray-700">Show activity
          <select value={petHistoryFilter} onChange={(event) => setPetHistoryFilter(event.target.value as typeof petHistoryFilter)} className="mt-1 block w-full rounded-lg border border-pp-line bg-white px-3 py-2">
            <option value="all">All activity</option><option value="daily">Daily cash</option><option value="bank">Bank deposits</option>
          </select>
        </label>
        {petHistoryFilter !== "bank" && <>
        <h3 className="mt-5 text-sm font-semibold text-gray-900">Daily cash log</h3>
        {petResort.recentDailyCash.length > 0 ? <ul className="mt-2 divide-y divide-pp-line">
          {petResort.recentDailyCash.map((entry) => <li key={entry.id} className="py-3 text-sm text-gray-700">
            {editingCash?.id === entry.id ? <form onSubmit={saveCashEdit} className="space-y-3 rounded-lg border border-pp-line bg-gray-50 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="font-medium">Date<input type="date" required value={editDate} onChange={(event) => setEditDate(event.target.value)} className="mt-1 block w-full rounded-lg border border-pp-line bg-white px-3 py-2" /></label>
                <label className="font-medium">Cash<input type="number" min="0.01" max="21474836.47" step="0.01" required value={editAmount} onChange={(event) => setEditAmount(event.target.value)} className="mt-1 block w-full rounded-lg border border-pp-line bg-white px-3 py-2" /></label>
              </div>
              <label className="block font-medium">Notes <span className="font-normal text-gray-500">(optional)</span><textarea rows={3} maxLength={2000} value={editNote} onChange={(event) => setEditNote(event.target.value)} className="mt-1 block w-full rounded-lg border border-pp-line bg-white px-3 py-2" /></label>
              {editError && <p role="alert" className="text-red-700">{editError}</p>}
              <div className="flex gap-2">
                <button type="submit" disabled={editSaving} className="rounded-lg bg-pp-accent px-4 py-2 font-semibold text-white disabled:opacity-50">{editSaving ? "Saving…" : "Save changes"}</button>
                <button type="button" disabled={editSaving} onClick={() => { setEditingCash(null); setEditError(""); }} className="rounded-lg border border-pp-line bg-white px-4 py-2 font-medium">Cancel</button>
              </div>
            </form> : <div className="flex flex-wrap items-start justify-between gap-2">
              <span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${entry.cashDate}T00:00:00Z`))}{entry.note && <span className="block whitespace-pre-wrap text-gray-500">{entry.note}</span>}</span>
              <span className="flex items-center gap-3"><span className="font-semibold">+{money(entry.amountCents)}</span><button type="button" onClick={() => beginCashEdit(entry)} className="font-medium text-pp-accent underline underline-offset-2" aria-label={`Edit daily cash entry for ${entry.cashDate}`}>Edit</button></span>
            </div>}
          </li>)}
        </ul> : <p className="mt-2 text-sm text-gray-500">No daily cash entries yet.</p>}
        {editMessage && <p role="status" className="mt-2 text-sm text-green-700">{editMessage}</p>}
        </>}
        {petHistoryFilter !== "daily" && <>
        <h3 className="mt-5 text-sm font-semibold text-gray-900">Bank deposits</h3>
        {petResort.recentDeposits.length > 0 ? <ul className="mt-4 divide-y divide-pp-line">
          {petResort.recentDeposits.map((deposit) => <li key={deposit.id} className="flex justify-between gap-4 py-3 text-sm text-gray-700">
            <span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "America/New_York" }).format(new Date(deposit.depositedAt))}</span>
            <span className="font-semibold">Bank deposit · {money(deposit.amountCents)}</span>
          </li>)}
        </ul> : <p className="mt-4 text-sm text-gray-500">No Pet Resort bank deposits recorded yet.</p>}
        </>}
      </section>
      <section className={cashView === "safe" && detailView === "history" ? "rounded-xl border border-pp-line bg-white p-6 shadow-sm" : "hidden"}>
        <h2 className="text-lg font-semibold text-gray-900">Mobile Grooming activity</h2>
        <p className="mt-2 text-sm text-gray-600">Completed week net + closeout adjustments: {money(mobile.payrollCents)} · Counted cash awaiting closeout: {money(mobile.pendingCountedCents)} · Cash adjustments: {money(mobile.adjustmentCents)} · Banked: {money(mobile.bankedCents)}</p>
        <label className="mt-5 block max-w-xs text-sm font-medium text-gray-700">Show activity
          <select value={mobileHistoryFilter} onChange={(event) => setMobileHistoryFilter(event.target.value as MobileHistoryFilter)} className="mt-1 block w-full rounded-lg border border-pp-line bg-white px-3 py-2">
            <option value="all">All activity</option><option value="counted">Counted cash</option><option value="completed">Completed weeks</option><option value="adjustment">Closeout adjustments</option><option value="manual">Cash adjustments</option><option value="bank">Bank deposits</option>
          </select>
        </label>
        {visibleMobileLedger.length > 0 ? (
          <div className="mt-4">
            <div className="hidden grid-cols-[7rem_minmax(0,1fr)_7rem_8rem] gap-3 border-b border-pp-line pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 sm:grid">
              <span>Date</span><span>Activity</span><span className="text-right">Change</span><span className="text-right">Balance</span>
            </div>
            <ul className="divide-y divide-pp-line">
              {visibleMobileLedger.map((entry) => (
                <li key={entry.id} className="grid gap-1 py-3 text-sm text-gray-700 sm:grid-cols-[7rem_minmax(0,1fr)_7rem_8rem] sm:gap-3">
                  <span>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: entry.kind === "bank" || entry.kind === "manual" || entry.kind === "counted" ? "America/New_York" : "UTC" }).format(new Date(entry.occurredAt))}</span>
                  <span><span className="font-medium text-gray-900">{entry.label}</span><span className="block text-xs text-gray-500">{entry.detail}</span></span>
                  <span className={`font-semibold sm:text-right ${entry.amountCents < 0 ? "text-red-700" : "text-green-800"}`}>{entry.amountCents < 0 ? "−" : "+"}{money(Math.abs(entry.amountCents))}</span>
                  <span className="font-semibold text-gray-900 sm:text-right"><span className="font-normal text-gray-500 sm:hidden">Balance: </span>{money(entry.balanceCents)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : <p className="mt-4 text-sm text-gray-500">No activity matches this filter.</p>}
      </section>
    </div>
  );
}
