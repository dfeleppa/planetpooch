"use client";

import { useState } from "react";

const DAY_MS = 86_400_000;

export function MetaSyncRangeButton({ from, to }: { from: string; to: string }) {
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  async function syncRange() {
    setWorking(true);
    setProgress(null);
    try {
      const start = Date.parse(`${from}T00:00:00Z`);
      const end = Math.min(Date.parse(`${to}T00:00:00Z`), Date.now());
      const chunks = Math.ceil((end - start + DAY_MS) / (30 * DAY_MS));
      if (!Number.isFinite(start) || chunks < 1) throw new Error("Choose a past date range.");
      let completed = 0;
      for (let cursor = start; cursor <= end; cursor += 30 * DAY_MS) {
        const through = Math.min(cursor + 29 * DAY_MS, end);
        const response = await fetch("/api/marketing/performance/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ since: new Date(cursor).toISOString().slice(0, 10), until: new Date(through).toISOString().slice(0, 10) }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? `Meta sync failed (${response.status}).`);
        completed++;
        setProgress(`Synced ${completed} of ${chunks} date windows…`);
      }
      window.location.reload();
    } catch (error) {
      setProgress(error instanceof Error ? error.message : "Meta sync failed.");
      setWorking(false);
    }
  }

  return <div className="mt-3 flex flex-wrap items-center gap-3">
    <button type="button" onClick={syncRange} disabled={working}
      className="rounded-lg border border-blue-600 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
      {working ? "Syncing Meta…" : "Sync Meta for selected dates"}
    </button>
    {progress && <span role="status" className="text-xs text-gray-600">{progress}</span>}
  </div>;
}
