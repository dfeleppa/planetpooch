"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SEGMENTS, campaignIdentity, type SegmentCampaign } from "@/lib/marketing/campaign-segments";

export function CampaignSegmentAssignments({ campaigns }: { campaigns: SegmentCampaign[] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const rows = campaigns.filter((row) => (source === "all" || row.source === source) && [row.name, row.id, ...row.aliases].join(" ").toLowerCase().includes(search.toLowerCase()));
  async function save(row: SegmentCampaign) {
    const key = campaignIdentity(row.source, row.id);
    setSaving(key); setMessage("");
    try {
      const response = await fetch("/api/marketing/campaign-segments", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: row.source, campaignId: row.id, segment: drafts[key] ?? row.segment }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save segment.");
      setMessage(`Saved ${row.name}.`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not save segment."); }
    finally { setSaving(null); }
  }
  return <section className="rounded-xl border border-gray-200 bg-white p-5">
    <h2 className="text-lg font-semibold">Campaign assignments</h2>
    <p className="mt-2 text-sm text-gray-600">All imported Meta and Google Ads campaigns, including historical campaigns and website campaign tags. Assignments apply across reporting periods. Automatic suggestions use campaign names until you save a choice. These segments group reports; they do not change ad budgets or existing business assignments.</p>
    <div className="my-4 flex flex-wrap gap-3"><input aria-label="Search campaigns" placeholder="Search campaign name or ID" className="min-w-64 flex-1 rounded-lg border border-gray-300 p-2 text-sm" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Campaign platform" className="rounded-lg border border-gray-300 p-2 text-sm" value={source} onChange={(event) => setSource(event.target.value)}><option value="all">All platforms</option><option value="meta">Meta</option><option value="google-ads">Google Ads</option><option value="google-lsa">Google LSA tags</option></select></div>
    <p role="status" className="mb-3 text-sm text-gray-700">{message || `${rows.length} campaigns`}</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50"><tr>{["Platform", "Campaign", "Business segment", ""].map((label) => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-gray-100">{rows.map((row) => {
      const key = campaignIdentity(row.source, row.id);
      return <tr key={key}><td className="p-3">{row.source === "meta" ? "Meta" : row.source === "google-ads" ? "Google Ads" : "Google LSA"}</td><td className="p-3"><p className="font-medium">{row.name}</p><p className="text-xs text-gray-500">ID / tag: {row.id}</p>{row.aliases.length > 0 && <p className="text-xs text-gray-500">Also matches: {row.aliases.join(", ")}</p>}</td><td className="p-3"><select aria-label={`Segment for ${row.name} (${row.source}, ${row.id})`} disabled={saving !== null} value={drafts[key] ?? row.segment} onChange={(event) => setDrafts((current) => ({...current, [key]: event.target.value}))} className="rounded-lg border border-gray-300 bg-white p-2">{SEGMENTS.map((segment) => <option key={segment.value} value={segment.value}>{segment.label}</option>)}</select><p className="mt-1 text-xs text-gray-500">{drafts[key] !== undefined && drafts[key] !== row.segment ? "Unsaved change" : row.saved ? "Saved assignment" : "Automatic suggestion"}</p></td><td className="p-3"><button type="button" aria-label={`Save segment for ${row.name} (${row.source}, ${row.id})`} disabled={saving !== null} onClick={() => save(row)} className="rounded-lg bg-slate-800 px-3 py-2 text-white disabled:opacity-50">{saving === key ? "Saving…" : "Save"}</button></td></tr>;
    })}</tbody></table>{rows.length === 0 && <p className="py-6 text-sm text-gray-600">No campaigns match your search.</p>}</div>
  </section>;
}
