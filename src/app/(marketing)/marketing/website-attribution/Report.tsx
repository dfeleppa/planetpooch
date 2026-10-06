import { requireMarketing } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { WebsiteFormSubmissionRow } from "@/lib/marketing/new-client-submissions";
import { classifyMoegoClientHistory, normalizedPhone, type MoegoClientProfile } from "@/lib/marketing/moego-client-history";
import { addCalendarDays, resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";
import { SubmissionTable } from "./SubmissionTable";

type PageProps = { searchParams: Promise<{ submissionStart?: string; submissionEnd?: string; page?: string }> };
const SUBMISSIONS_PER_PAGE = 50;

export async function WebsiteAttributionReport({ searchParams }: PageProps) {
  await requireMarketing();
  const business = await getActiveBusiness();
  const params = await searchParams;
  const submissionRange = resolveSubmissionDateRange(params.submissionStart, params.submissionEnd);
  const submissionTotals = await prisma.$queryRaw<{ submissions: number; synced: number; attention: number; conflicts: number }[]>`
      SELECT COUNT(*)::int AS submissions,
        COUNT(*) FILTER (WHERE "status" = 'SYNCED')::int AS synced,
        COUNT(*) FILTER (WHERE "status" NOT IN ('SYNCED', 'MOEGO_DUPLICATE_CONFLICT'))::int AS attention,
        COUNT(*) FILTER (WHERE "status" = 'MOEGO_DUPLICATE_CONFLICT')::int AS conflicts
      FROM "WebsiteFormSubmission"
      WHERE "company" = ${business.company}::"Company"
        AND "receivedAt" >= ${submissionRange.startAt}
        AND "receivedAt" < ${submissionRange.endBefore}`;
  const formTotal = submissionTotals[0];
  const pageCount = Math.max(1, Math.ceil(Number(formTotal.submissions) / SUBMISSIONS_PER_PAGE));
  const requestedPage = typeof params.page === "string" && /^\d+$/.test(params.page) ? Number(params.page) : 1;
  const page = Number.isSafeInteger(requestedPage) ? Math.min(Math.max(requestedPage, 1), pageCount) : 1;
  const submissions = await prisma.websiteFormSubmission.findMany({
    where: { company: business.company, receivedAt: { gte: submissionRange.startAt, lt: submissionRange.endBefore } },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * SUBMISSIONS_PER_PAGE,
    take: SUBMISSIONS_PER_PAGE,
    include: { events: { orderBy: { createdAt: "asc" } } },
  }) as WebsiteFormSubmissionRow[];
  const phones = [...new Set(submissions.map((row) => normalizedPhone(row.phone)).filter((phone): phone is string => phone !== null))];
  const [customerProfiles, customerSync] = await Promise.all([
    phones.length ? prisma.$queryRaw<MoegoClientProfile[]>(Prisma.sql`
      SELECT "moegoId", "name", "mainPhoneNumber", "createdTime"
      FROM "MoegoCustomer"
      WHERE RIGHT(REGEXP_REPLACE(COALESCE("mainPhoneNumber", ''), '[^0-9]', '', 'g'), 10)
        IN (${Prisma.join(phones)})
      ORDER BY "createdTime", "moegoId"
    `) : Promise.resolve([]),
    prisma.moegoCustomer.aggregate({ _max: { syncedAt: true } }),
  ]);
  const profilesByPhone = new Map<string, MoegoClientProfile[]>();
  for (const customer of customerProfiles) {
    const phone = normalizedPhone(customer.mainPhoneNumber);
    if (!phone) continue;
    const profiles = profilesByPhone.get(phone) ?? [];
    profiles.push(customer);
    profilesByPhone.set(phone, profiles);
  }
  const submissionsWithHistory = submissions.map((submission) => ({
    ...submission,
    clientHistory: customerSync._max.syncedAt ? classifyMoegoClientHistory(
      submission.phone, submission.receivedAt,
      profilesByPhone.get(normalizedPhone(submission.phone) ?? "") ?? [],
    ) : { status: "unavailable" as const, profiles: [], oldestPriorProfile: null },
  }));
  const existingCount = submissionsWithHistory.filter((row) => row.clientHistory.status === "existing").length;
  const formatTime = (date: Date) => new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", dateStyle: "short", timeStyle: "short",
  }).format(date);

  return (
    <div className="min-w-0">
      <h2 className="text-lg font-semibold text-gray-900">Form Submissions</h2>
      <section className="mt-6 min-w-0">
        <h3 className="text-lg font-semibold text-gray-900">New Client Form Submissions</h3>
        <p className="mt-2 text-sm text-gray-600">
          Durable copies received from /new-client/ before MoeGo is contacted. Every attempt and status transition is retained. Times are Eastern.
        </p>
        <form className="mt-5 flex flex-wrap items-end gap-3" method="get">
          <input type="hidden" name="view" value="submissions" />
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
              return <a key={days} className="text-blue-700 hover:underline" href={`?view=submissions&submissionStart=${start}&submissionEnd=${submissionRange.end}`}>{days} days</a>;
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
        {customerSync._max.syncedAt ? <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>{existingCount} of {submissionsWithHistory.length} submissions on this page</strong> match a MoeGo client profile created more than 90 days before the form was received.
          <div className="mt-1 text-amber-900">Matches use the last 10 phone digits and include duplicate MoeGo profiles. Customer records last synced {formatTime(customerSync._max.syncedAt)}. No match only means none was found in the synced records.</div>
        </div> : <div className="mb-4 rounded-xl border border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-800">
          <strong>MoeGo client history unavailable.</strong> This app has no synced MoeGo customer records yet. Client-age attribution will appear after the customer sync is configured and run.
        </div>}
        <SubmissionTable submissions={submissionsWithHistory} total={Number(formTotal.submissions)} page={page} pageCount={pageCount} pageSize={SUBMISSIONS_PER_PAGE} startDate={submissionRange.start} endDate={submissionRange.end} />
      </section>

    </div>
  );
}
