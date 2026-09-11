"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BusinessCompany } from "@/lib/business";

export function CampaignBusinessAssignments({ campaigns }: { campaigns: { id: string; name: string; companies: BusinessCompany[] }[] }) {
  const router = useRouter();
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const unassigned = campaigns.filter((campaign) => campaign.companies.length === 0).length;

  async function assign(campaignId: string, value: string) {
    if (!value) return;
    setSaving(campaignId);
    setError("");
    try {
      const response = await fetch("/api/marketing/campaign-business", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ campaignId, companies: value === "BOTH" ? ["RESORT", "GROOMING"] : [value] }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Unable to save assignment");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to save assignment"); }
    finally { setSaving(null); }
  }

  if (!campaigns.length) return null;
  return (
    <details className="mb-5 rounded-lg border border-gray-200 bg-white p-4" open={unassigned > 0 ? true : undefined}>
      <summary className="cursor-pointer text-sm font-medium text-gray-700">Campaign assignments{unassigned > 0 ? ` · ${unassigned} need a business` : ""}</summary>
      <p className="mt-2 text-xs text-gray-500">Assign each campaign to a business to include its results. Shared campaign results appear in both views.</p>
      <div className="mt-3 space-y-2">
        {campaigns.map((campaign) => (
          <label key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>{campaign.name}</span>
            <select aria-label={`Business assignment for ${campaign.name}`} disabled={saving !== null}
              value={campaign.companies.length === 2 ? "BOTH" : campaign.companies[0] ?? ""}
              onChange={(event) => void assign(campaign.id, event.target.value)} className="rounded border border-gray-300 px-2 py-1">
              <option value="" disabled>Choose business</option><option value="RESORT">Pet Resort</option>
              <option value="GROOMING">Mobile Grooming</option><option value="BOTH">Shared</option>
            </select>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
    </details>
  );
}
