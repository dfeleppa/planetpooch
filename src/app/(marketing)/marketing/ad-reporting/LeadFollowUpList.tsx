"use client";

import { useState } from "react";
import type { loadLeadOutcomes } from "./LeadOutcomesReport";

type Outcomes = Awaited<ReturnType<typeof loadLeadOutcomes>>;
const labels = { meta: "Meta", "google-ads": "Google Ads", "google-lsa": "Google LSA", unattributed: "Unattributed" };

export function LeadFollowUpList({ outcomes }: { outcomes: Outcomes }) {
  const [search, setSearch] = useState("");
  const [business, setBusiness] = useState("all");
  const [status, setStatus] = useState("all");
  const [showAll, setShowAll] = useState(false);
  const candidates = outcomes.leads.filter((lead) => lead.booked === 0);
  const filtered = candidates.filter((lead) => (business === "all" || lead.business === business)
    && (status === "all" || (status === "pending" ? lead.pending > 0 : lead.pending === 0))
    && [lead.customer, lead.phone, lead.email, lead.campaignName, ...lead.services].join(" ").toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  return <section aria-label="Lead follow-up" className="rounded-xl border border-gray-200 bg-white p-5">
    <h3 className="font-semibold text-gray-900">Lead follow-up {outcomes.appointmentsAvailable ? `(${candidates.length})` : ""}</h3>
    <p className="mt-1 text-sm text-gray-600">Linked website inquiries with no qualifying booking recorded, oldest first. Check MoeGo before contacting a customer. Unlinked submissions and LSA callers are not included.</p>
    {!outcomes.appointmentsAvailable ? <p className="mt-3 text-sm text-amber-800">Booking data is unavailable. Update MoeGo to identify inquiries needing review.</p> : <>
      {outcomes.incomplete && <p className="mt-3 text-sm text-amber-800">MoeGo data may be behind. These are review candidates, not confirmed missed bookings.</p>}
      <div className="my-4 flex flex-wrap gap-3 print:hidden">
        <input aria-label="Search follow-up inquiries" placeholder="Search name, contact, service or campaign" value={search} onChange={(event) => { setSearch(event.target.value); setShowAll(false); }} className="min-w-64 flex-1 rounded-lg border border-gray-300 p-2 text-sm" />
        <select aria-label="Follow-up business" value={business} onChange={(event) => setBusiness(event.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm"><option value="all">All businesses</option><option>Pet Resort</option><option>Mobile Grooming</option></select>
        <select aria-label="Follow-up booking status" value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-gray-300 p-2 text-sm"><option value="all">All review candidates</option><option value="none">No booking recorded</option><option value="pending">Pending appointment</option></select>
      </div>
      <p className="mb-2 text-xs text-gray-600" aria-live="polite">{filtered.length} matching inquiries. Contact history and follow-up assignments are not tracked here.</p>
      {filtered.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm">
        <thead className="bg-slate-50 text-xs text-gray-600"><tr>{["Received (ET)", "Customer / contact", "Business / service", "Source / campaign", "Booking status"].map((label) => <th key={label} scope="col" className="p-3 font-medium">{label}</th>)}</tr></thead>
        <tbody className="divide-y divide-gray-100">{(showAll ? filtered : filtered.slice(0, 10)).map((lead) => <tr key={lead.id}>
          <td className="whitespace-nowrap p-3">{new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium" }).format(new Date(lead.receivedAt))}</td>
          <td className="p-3"><p className="font-medium">{lead.customer}</p>{lead.phone && <a className="block text-blue-700 underline" href={`tel:${lead.phone.replace(/[^+\d]/g, "")}`}>{lead.phone}</a>}{lead.email && <a className="block text-blue-700 underline" href={`mailto:${lead.email}`}>{lead.email}</a>}<p className="text-xs text-gray-500">MoeGo customer: {lead.moegoCustomerId}</p></td>
          <td className="p-3">{lead.business}<p className="text-xs text-gray-600">{lead.services.join(", ") || "Service not supplied"}</p></td>
          <td className="p-3">{labels[lead.source]}<p className="text-xs text-gray-600">{lead.campaignName || "Campaign not supplied"}</p></td>
          <td className="p-3"><span className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">{lead.pending > 0 ? "Pending appointment" : "No booking recorded"}</span></td>
        </tr>)}</tbody>
      </table></div> : <p className="py-3 text-sm text-gray-600">No linked inquiries match these filters.</p>}
      {filtered.length > 10 && <button type="button" className="mt-3 text-sm text-blue-700 underline print:hidden" onClick={() => setShowAll(!showAll)}>{showAll ? "Show first 10" : `Show all ${filtered.length}`}</button>}
    </>}
  </section>;
}
