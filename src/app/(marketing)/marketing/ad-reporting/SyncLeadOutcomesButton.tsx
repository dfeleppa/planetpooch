"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SyncLeadOutcomesButton() {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function sync() {
    setWorking(true);
    setMessage(null);
    try {
      const response = await fetch("/api/marketing/lead-outcomes/sync", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "MoeGo appointment sync failed");
      setMessage(result.caughtUp ? "Appointments are current." : "Backfill is still running. Sync again to continue.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setWorking(false);
    }
  }

  return <div className="flex flex-wrap items-center gap-2">
    <button type="button" onClick={sync} disabled={working} className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60">
      {working ? "Syncing MoeGo…" : "Sync MoeGo appointments"}
    </button>
    {message && <span role="status" className="text-xs text-gray-600">{message}</span>}
  </div>;
}
