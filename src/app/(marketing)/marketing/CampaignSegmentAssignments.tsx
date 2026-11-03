"use client";

import { readApiResponse } from "@/lib/api-response";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SEGMENTS, campaignIdentity, type SegmentCampaign } from "@/lib/marketing/campaign-segments";

export function CampaignSegmentAssignments({ campaigns }: { campaigns: SegmentCampaign[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const rows = campaigns.filter((row) => (source === "all" || row.source === source) && [row.name, row.id, ...row.aliases].join(" ").toLowerCase().includes(search.toLowerCase()));
  const changes = campaigns.filter((row) => drafts[campaignIdentity(row.source, row.id)] !== undefined && drafts[campaignIdentity(row.source, row.id)] !== row.segment);
  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/marketing/campaign-segments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignments: changes.map((row) => ({ source: row.source, campaignId: row.id, segment: drafts[campaignIdentity(row.source, row.id)] })) }) });
      const result = await readApiResponse(response);
      if (!response.ok) throw new Error(result.error || "Could not save segment.");
      setMessage(`Saved ${result.saved} campaign assignments.`);
      setDrafts({});
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save segment."); }
    finally { setSaving(false); }
  }
  return <section className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Campaign assignments</h2><button type="button" disabled={saving || changes.length === 0} onClick={save} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? "Saving…" : "Save all"}</button></div>
    <p className="mt-2 text-sm text-gray-600">All imported Meta and Google Ads campaigns, including historical campaigns and website campaign tags. Assignments apply across reporting periods. Automatic suggestions use campaign names until you save a choice. These segments group reports; they do not change ad budgets or existing business assignments.</p>
    <div className="my-4 flex flex-wrap gap-3"><input aria-label="Search campaigns" placeholder="Search campaign name or ID" className="min-w-64 flex-1 rounded-lg border border-gray-300 p-2 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Campaign platform" className="rounded-lg border border-gray-300 p-2 text-sm" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All platforms</option><option value="meta">Meta</option><option value="google-ads">Google Ads</option><option value="google-lsa">Google LSA tags</option></select></div>
    <p className="mb-2 text-sm text-gray-600">{changes.length} unsaved changes across all campaigns, including those hidden by search or platform filters.</p>
    <p role="status" className="mb-3 text-sm text-gray-700">{message || `${rows.length} campaigns`}</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50"><tr>{["Platform", "Campaign", "Business segment"].map((label) => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{rows.map((row) => {
      const key = campaignIdentity(row.source, row.id);
      return <tr key={key}><td className="p-3">{row.source === "meta" ? "Meta" : row.source === "google-ads" ? "Google Ads" : "Google LSA"}</td><td className="p-3"><p className="font-medium">{row.name}</p><p className="text-xs text-gray-500">ID / tag: {row.id}</p>{row.aliases.length > 0 && <p className="text-xs text-gray-500">Also matches: {row.aliases.join(", ")}</p>}</td><td className="p-3"><select aria-label={`Segment for ${row.name} (${row.source}, ${row.id})`} disabled={saving} value={drafts[key] ?? row.segment} onChange={(event) => setDrafts((current) => ({...current, [key]: event.target.value}))} className="rounded-lg border border-gray-300 bg-white p-2">{SEGMENTS.map((segment) => <option key={segment.value} value={segment.value}>{segment.label}</option>)}</select><p className="mt-1 text-xs text-gray-500">{drafts[key] !== undefined && drafts[key] !== row.segment ? "Unsaved change" : row.saved ? "Saved assignment" : "Automatic suggestion"}</p></td></tr>;
    })}</tbody></table>{rows.length === 0 && <p className="py-6 text-sm text-gray-600">No campaigns match your search.</p>}</div>
  </section>;
}
