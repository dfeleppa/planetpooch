import { requireMarketing } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import type { WebsiteAttributionVisit } from "@/lib/marketing/website-attribution";

export const dynamic = "force-dynamic";

export default async function WebsiteAttributionPage() {
  await requireMarketing();
  const business = await getActiveBusiness();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totals, visits] = await Promise.all([
    prisma.$queryRaw<{ visits: number; visitors: number; tagged: number }[]>`
      SELECT COUNT(*)::int AS visits, COUNT(DISTINCT "visitorId")::int AS visitors,
        COUNT(*) FILTER (WHERE "campaign" <> '{}'::jsonb OR "clickIds" <> '{}'::jsonb)::int AS tagged
      FROM "WebsiteAttributionVisit" WHERE "company" = ${business.company}::"Company" AND "createdAt" >= ${since}`,
    prisma.$queryRaw<WebsiteAttributionVisit[]>`
      SELECT "id", "visitorId", "createdAt", "landingPage", "referrerOrigin", "campaign", "clickIds"
      FROM "WebsiteAttributionVisit" WHERE "company" = ${business.company}::"Company" AND "createdAt" >= ${since}
      ORDER BY "createdAt" DESC, "id" DESC LIMIT 100`,
  ]);
  const total = totals[0];
  const formatTime = (date: Date) => new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "short", timeStyle: "short",
  }).format(date);

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Website Attribution</h2>
      <p className="mt-2 text-sm text-gray-600">
        {business.label} · Last 30 days · Visits to /get-started/. These are anonymous
        visits, not submitted forms, leads, bookings, or revenue. Visitor counts are
        browser-based estimates; blocked tracking and cleared storage affect totals.
      </p>
      <div className="my-6 grid gap-4 sm:grid-cols-3">
        {[["Recorded visits", total.visits], ["Unique browsers", total.visitors], ["Campaign / ad-tagged visits", total.tagged]].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-sm text-gray-600">{label}</p>
            <p className="mt-2 text-3xl font-semibold">{Number(value).toLocaleString()}</p>
          </div>
        ))}
      </div>
      <h3 className="mb-3 font-semibold">Latest visits</h3>
      <p className="mb-3 text-sm text-gray-500">Showing up to 100 visits. Times are Eastern. Each row shows the source captured on that visit.</p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50"><tr>
            {["Time", "Source / medium", "Campaign", "Content / term", "Ad click IDs", "Referrer", "Landing page"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
          </tr></thead>
          <tbody>
            {visits.map((visit) => (
              <tr key={visit.id} className="border-t border-gray-100 align-top">
                <td className="whitespace-nowrap px-4 py-3">{formatTime(visit.createdAt)}</td>
                <td className="max-w-48 break-words px-4 py-3">{visit.campaign.utm_source || "Untagged"} / {visit.campaign.utm_medium || "—"}</td>
                <td className="max-w-48 break-words px-4 py-3">{visit.campaign.utm_campaign || "—"}</td>
                <td className="max-w-48 break-words px-4 py-3">{visit.campaign.utm_content || "—"} / {visit.campaign.utm_term || "—"}</td>
                <td className="max-w-56 break-all px-4 py-3">{Object.entries(visit.clickIds).map(([key, value]) => <details key={key}><summary className="cursor-pointer">{key}</summary><span>{value}</span></details>)}{Object.keys(visit.clickIds).length === 0 && "—"}</td>
                <td className="max-w-48 break-all px-4 py-3">{visit.referrerOrigin || "None recorded"}</td>
                <td className="max-w-48 break-all px-4 py-3">{visit.landingPage}</td>
              </tr>
            ))}
            {visits.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No recorded visits for this business in the last 30 days.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
