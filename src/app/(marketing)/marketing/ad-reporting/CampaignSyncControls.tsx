"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Campaign = { id: string; name: string; business: string | null };
type Platform = "Meta" | "Google Ads" | "MoeGo";
const DAY_MS = 86_400_000;
const buttonClass = "inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-slate-800 px-4 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50";
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "Never";

async function jsonRequest(url: string, options?: RequestInit) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error ?? `Update failed (${response.status}).`);
  return result;
}

export function CampaignSyncControls({ from, to, isAdmin, metaSyncedAt, googleSyncedAt, moegoSyncedAt, onUpdated }: {
  from: string; to: string; isAdmin: boolean;
  metaSyncedAt: string | null; googleSyncedAt: string | null; moegoSyncedAt: string | null;
  onUpdated: () => void;
}) {
  const router = useRouter();
  const [working, setWorking] = useState<Platform | "all" | null>(null);
  const [status, setStatus] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);

  async function syncMeta() {
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Math.min(Date.parse(`${to}T00:00:00Z`), Date.now());
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("Choose a past date range.");
    for (let cursor = start; cursor <= end; cursor += 30 * DAY_MS) {
      const through = Math.min(cursor + 29 * DAY_MS, end);
      setStatus(`Updating Meta through ${new Date(through).toISOString().slice(0, 10)}…`);
      await jsonRequest("/api/marketing/performance/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ since: new Date(cursor).toISOString().slice(0, 10), until: new Date(through).toISOString().slice(0, 10) }),
      });
    }
  }

  async function syncGoogle() {
    const query = new URLSearchParams({ from, to });
    const result = await jsonRequest(`/api/marketing/google-ads/campaigns?${query}`);
    const rows = result.campaigns as Campaign[];
    if (rows.some((campaign) => !campaign.business)) {
      setCampaigns(rows);
      throw new Error("Assign the Google Ads campaigns below, then update Google Ads again.");
    }
    await jsonRequest("/api/marketing/google-ads/sync", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }),
    });
    setCampaigns(null);
  }

  async function syncMoeGo() {
    const result = await jsonRequest("/api/marketing/lead-outcomes/sync", { method: "POST" });
    return result.caughtUp ? "" : "MoeGo backfill is still running; update again to continue.";
  }

  async function update(platform: Platform | "all") {
    setWorking(platform);
    setStatus("");
    const completed: string[] = [];
    const issues: string[] = [];
    const targets: Platform[] = platform === "all" ? ["Meta", "Google Ads", "MoeGo"] : [platform];
    for (const target of targets) {
      try {
        setStatus(`Updating ${target}…`);
        if (target === "Meta") await syncMeta();
        if (target === "Google Ads") await syncGoogle();
        if (target === "MoeGo") {
          const warning = await syncMoeGo();
          if (warning) issues.push(warning);
        }
        completed.push(target);
      } catch (error) {
        issues.push(`${target}: ${error instanceof Error ? error.message : "Update failed."}`);
      }
    }
    setStatus(`${completed.length ? `Updated ${completed.join(", ")}.` : ""}${issues.length ? ` ${issues.join(" ")}` : ""}`.trim());
    if (completed.length) {
      onUpdated();
      router.refresh();
    }
    setWorking(null);
  }

  async function assign(campaign: Campaign, business: string) {
    setWorking("Google Ads");
    setStatus("");
    try {
      await jsonRequest("/api/marketing/google-ads/campaigns", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, campaign: campaign.name, business: business || null }),
      });
      setCampaigns((current) => current?.map((row) => row.id === campaign.id ? { ...row, business: business || null } : row) ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save campaign division.");
    } finally {
      setWorking(null);
    }
  }

  return <div className="w-full print:hidden">
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <button type="button" className={buttonClass} disabled={working !== null} onClick={() => update("Meta")}>Update Meta</button>
      <button type="button" className={buttonClass} disabled={working !== null} onClick={() => update("Google Ads")}>Update Google Ads</button>
      {isAdmin && <button type="button" className={buttonClass} disabled={working !== null} onClick={() => update("MoeGo")}>Update MoeGo</button>}
      {isAdmin && <button type="button" className={buttonClass} disabled={working !== null} onClick={() => update("all")}>Update all</button>}
    </div>
    <p className="mt-1 text-xs text-gray-500">Last updated (ET) · Meta: {dateTime(metaSyncedAt)} · Google Ads: {dateTime(googleSyncedAt)} · MoeGo appointments: {dateTime(moegoSyncedAt)}</p>
    {status && <p role="status" className="mt-1 text-xs text-gray-700">{status}</p>}
    {campaigns?.some((campaign) => !campaign.business) && <div className="mt-2 rounded-lg border border-gray-200 bg-white p-3">
      <p className="mb-2 text-sm font-medium">Assign each Google Ads campaign before syncing this date range.</p>
      <div className="max-h-64 space-y-2 overflow-auto">{campaigns.map((campaign) => <label key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{campaign.name} <span className="text-gray-500">({campaign.id})</span></span>
        <select value={campaign.business ?? ""} onChange={(event) => assign(campaign, event.target.value)} disabled={working !== null} aria-label={`Division for ${campaign.name}`} className="rounded border border-gray-300 bg-white px-2 py-1">
          <option value="">Choose division</option><option value="pet-resort">Pet Resort</option><option value="mobile-grooming">Mobile Grooming</option><option value="excluded">Exclude from these reports</option>
        </select>
      </label>)}</div>
    </div>}
  </div>;
}
