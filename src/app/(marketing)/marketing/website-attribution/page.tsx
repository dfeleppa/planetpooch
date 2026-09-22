import { requireMarketing } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import type { WebsiteAttributionVisit } from "@/lib/marketing/website-attribution";
import type { WebsiteFormSubmissionRow } from "@/lib/marketing/new-client-submissions";
import { addCalendarDays, resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";

export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ submissionStart?: string; submissionEnd?: string }> };

export default async function WebsiteAttributionPage({ searchParams }: PageProps) {
  await requireMarketing();
  const business = await getActiveBusiness();
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const params = await searchParams;
  const submissionRange = resolveSubmissionDateRange(params.submissionStart, params.submissionEnd);
  const [totals, visits, submissionTotals, submissions] = await Promise.all([
    prisma.$queryRaw<{ visits: number; visitors: number; tagged: number }[]>`
      SELECT COUNT(*)::int AS visits, COUNT(DISTINCT "visitorId")::int AS visitors,
        COUNT(*) FILTER (WHERE "campaign" <> '{}'::jsonb OR "clickIds" <> '{}'::jsonb)::int AS tagged
      FROM "WebsiteAttributionVisit" WHERE "company" = ${business.company}::"Company" AND "createdAt" >= ${since}`,
    prisma.$queryRaw<WebsiteAttributionVisit[]>`
      SELECT "id", "visitorId", "createdAt", "landingPage", "referrerOrigin", "campaign", "clickIds"
      FROM "WebsiteAttributionVisit" WHERE "company" = ${business.company}::"Company" AND "createdAt" >= ${since}
      ORDER BY "createdAt" DESC, "id" DESC LIMIT 100`,
    prisma.$queryRaw<{ submissions: number; synced: number; attention: number; conflicts: number }[]>`
      SELECT COUNT(*)::int AS submissions,
        COUNT(*) FILTER (WHERE "status" = 'SYNCED')::int AS synced,
        COUNT(*) FILTER (WHERE "status" NOT IN ('SYNCED', 'MOEGO_DUPLICATE_CONFLICT'))::int AS attention,
        COUNT(*) FILTER (WHERE "status" = 'MOEGO_DUPLICATE_CONFLICT')::int AS conflicts
      FROM "WebsiteFormSubmission"
      WHERE "company" = ${business.company}::"Company"
        AND "receivedAt" >= ${submissionRange.startAt}
        AND "receivedAt" < ${submissionRange.endBefore}`,
    prisma.websiteFormSubmission.findMany({
      where: { company: business.company, receivedAt: { gte: submissionRange.startAt, lt: submissionRange.endBefore } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }], take: 250,
      include: { events: { orderBy: { createdAt: "asc" } } },
    }) as Promise<WebsiteFormSubmissionRow[]>,
  ]);
  const total = totals[0];
  const formTotal = submissionTotals[0];
  const formatTime = (date: Date) => new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "short", timeStyle: "short",
  }).format(date);

  return (
    <div>
      <h2 className="text-xl font-semibold text-gray-900">Website Attribution</h2>
      <section className="mt-6">
        <h3 className="text-lg font-semibold text-gray-900">New Client Form Submissions</h3>
        <p className="mt-2 text-sm text-gray-600">
          Durable copies received from /new-client/ before MoeGo is contacted. Every attempt and status transition is retained. Times are Eastern.
        </p>
        <form className="mt-5 flex flex-wrap items-end gap-3" method="get">
          <label className="text-sm font-medium text-gray-700">
            Start date
            <input className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900" type="date" name="submissionStart" defaultValue={submissionRange.start} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            End date
            <input className="mt-1 block rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal text-gray-900" type="date" name="submissionEnd" defaultValue={submissionRange.end} />
          </label>
          <button className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700" type="submit">Apply dates</button>
          <div className="flex items-center gap-2 pb-2 text-sm">
            {[7, 30, 90].map((days) => {
              const start = addCalendarDays(submissionRange.end, -(days - 1));
              return <a key={days} className="text-blue-700 hover:underline" href={`?submissionStart=${start}&submissionEnd=${submissionRange.end}`}>{days} days</a>;
            })}
          </div>
        </form>
        <p className="mt-2 text-sm text-gray-500">Showing submissions received from {submissionRange.start} through {submissionRange.end}, inclusive.</p>
        <div className="my-5 grid gap-4 sm:grid-cols-4">
          {[["Saved submissions", formTotal.submissions], ["Synced to MoeGo", formTotal.synced], ["Needs attention", formTotal.attention], ["Existing-phone conflicts", formTotal.conflicts]].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white p-5">
              <p className="text-sm text-gray-600">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50"><tr>
              {['Received', 'Customer', 'Contact', 'Pets / services', 'Consent', 'Status', 'MoeGo', 'Attempts', 'History / complete record'].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
            </tr></thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.id} className="border-t border-gray-100 align-top">
                  <td className="whitespace-nowrap px-4 py-3">{formatTime(submission.receivedAt)}<div className="mt-1 text-xs text-gray-500">Updated {formatTime(submission.updatedAt)}</div></td>
                  <td className="max-w-48 break-words px-4 py-3">{[submission.firstName, submission.lastName].filter(Boolean).join(' ') || 'Unvalidated'}<div className="mt-1 break-all text-xs text-gray-500">{submission.id}</div></td>
                  <td className="max-w-52 break-all px-4 py-3">{submission.phone || '—'}<br />{submission.email || '—'}</td>
                  <td className="max-w-64 break-words px-4 py-3">
                    {submission.pets.length ? submission.pets.map((pet, index) => {
                      const row = pet as { name?: string; breed?: string };
                      return <div key={index}>{row.name || 'Unnamed'}{row.breed ? ` · ${row.breed}` : ''}</div>;
                    }) : '—'}
                    <div className="mt-1 text-xs text-gray-500">{submission.services.join(', ') || 'No service selected'}</div>
                  </td>
                  <td className="px-4 py-3">{submission.marketingConsent === null ? 'Unknown' : submission.marketingConsent ? 'Yes' : 'No'}</td>
                  <td className="max-w-52 break-words px-4 py-3"><span className="font-medium">{submission.status}</span>{submission.lastHttpStatus && <div className="mt-1 text-xs text-gray-500">HTTP {submission.lastHttpStatus}</div>}{submission.lastError && <div className="mt-1 text-xs text-red-700">{submission.lastError}</div>}</td>
                  <td className="max-w-48 break-all px-4 py-3">{submission.moegoLeadId || 'Not confirmed'}{submission.moegoSyncedAt && <div className="mt-1 text-xs text-gray-500">Synced {formatTime(submission.moegoSyncedAt)}</div>}</td>
                  <td className="px-4 py-3 text-center">{submission.attemptCount}</td>
                  <td className="min-w-64 max-w-96 px-4 py-3">
                    <details><summary className="cursor-pointer font-medium">{submission.events.length} events</summary><ol className="mt-2 space-y-2 text-xs">{submission.events.map((event) => <li key={event.id}><span className="font-medium">{formatTime(event.createdAt)} · {event.status}</span>{event.httpStatus && ` · HTTP ${event.httpStatus}`}{event.message && <div>{event.message}</div>}</li>)}</ol></details>
                    <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Full submitted payload</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs">{JSON.stringify(submission.payload, null, 2)}</pre></details>
                    <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Attribution and request metadata</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs">{JSON.stringify({ attribution: submission.attribution, request: submission.requestMetadata }, null, 2)}</pre></details>
                  </td>
                </tr>
              ))}
              {submissions.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No saved new-client submissions in the selected date range.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-10 border-t border-gray-200 pt-8">
      <h3 className="text-lg font-semibold text-gray-900">Anonymous Get Started Visits</h3>
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
      </section>
    </div>
  );
}
