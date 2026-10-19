"use client";

import { useState } from "react";

type Campaign = { id: string; name: string; business: string | null };

export function GoogleAdsSync({ from, to }: { from: string; to: string }) {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function loadCampaigns() {
    setWorking(true);
    setMessage("");
    try {
      const query = new URLSearchParams({ from, to });
      const response = await fetch(`/api/marketing/google-ads/campaigns?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not load Google Ads campaigns.");
      setCampaigns(data.campaigns);
      setMessage(data.campaigns.length ? "Assign each campaign to a division, then sync this date range." : "No Google Ads campaigns were returned for this date range.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load Google Ads campaigns.");
    } finally {
      setWorking(false);
    }
  }

  async function assign(campaign: Campaign, business: string) {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/marketing/google-ads/campaigns", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId: campaign.id, campaign: campaign.name, business: business || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save campaign division.");
      setCampaigns((current) => current?.map((row) => row.id === campaign.id ? { ...row, business: business || null } : row) ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save campaign division.");
    } finally {
      setWorking(false);
    }
  }

  async function sync() {
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/marketing/google-ads/sync", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? (data.unassigned?.length ? "Assign every campaign before syncing." : "Google Ads sync failed."));
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Google Ads sync failed.");
      setWorking(false);
    }
  }

  const unassigned = campaigns?.filter((campaign) => !campaign.business).length ?? 0;
  return <div className="mt-3 rounded-lg border border-gray-200 bg-white p-4">
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={loadCampaigns} disabled={working} className="rounded-lg border border-blue-600 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50">
        {working ? "Working…" : "Load Google Ads campaigns"}
      </button>
      {campaigns && <button type="button" onClick={sync} disabled={working || unassigned > 0} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Sync Google Ads for selected dates</button>}
    </div>
    {message && <p role="status" className="mt-2 text-sm text-gray-700">{message}</p>}
    {campaigns && campaigns.length > 0 && <div className="mt-3 max-h-64 space-y-2 overflow-auto">
      {campaigns.map((campaign) => <label key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{campaign.name} <span className="text-gray-500">({campaign.id})</span></span>
        <select value={campaign.business ?? ""} onChange={(event) => assign(campaign, event.target.value)} disabled={working} aria-label={`Division for ${campaign.name}`} className="rounded border border-gray-300 bg-white px-2 py-1">
          <option value="">Choose division</option>
          <option value="pet-resort">Pet Resort</option>
          <option value="mobile-grooming">Mobile Grooming</option>
          <option value="excluded">Exclude from these reports</option>
        </select>
      </label>)}
    </div>}
  </div>;
}
