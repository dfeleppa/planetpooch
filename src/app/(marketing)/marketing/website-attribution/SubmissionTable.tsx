"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { SubmissionWithClientHistory } from "@/lib/marketing/moego-client-history";

const columns = [
  { key: "received", label: "Received" },
  { key: "customer", label: "Customer" },
  { key: "contact", label: "Contact" },
  { key: "pets", label: "Pets / services" },
  { key: "consent", label: "Consent" },
  { key: "status", label: "Status" },
  { key: "moego", label: "MoeGo" },
  { key: "clientHistory", label: "MoeGo client history" },
  { key: "attempts", label: "Attempts" },
  { key: "history", label: "History / complete record" },
] as const;

type SortKey = (typeof columns)[number]["key"];
type Direction = "ascending" | "descending";

const collator = new Intl.Collator("en-US", { sensitivity: "base", numeric: true });
const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", dateStyle: "short", timeStyle: "short",
});

function formatTime(date: Date) {
  return timeFormatter.format(date);
}

function sortValue(submission: SubmissionWithClientHistory, key: SortKey): string | number {
  switch (key) {
    case "received": return submission.receivedAt.getTime();
    case "customer": return [submission.firstName, submission.lastName].filter(Boolean).join(" ") || "Unvalidated";
    case "contact": return submission.phone || submission.email || "";
    case "pets": return [
      ...submission.pets.map((pet) => {
        const row = pet as { name?: string; breed?: string };
        return [row.name || "Unnamed", row.breed].filter(Boolean).join(" ");
      }),
      ...submission.services,
    ].join(", ");
    case "consent": return submission.marketingConsent === null ? "Unknown" : submission.marketingConsent ? "Yes" : "No";
    case "status": return submission.status;
    case "moego": return submission.moegoLeadId || "Not confirmed";
    case "clientHistory": return submission.clientHistory.status === "existing" ? 0 :
      submission.clientHistory.status === "recent" ? 1 :
      submission.clientHistory.status === "created_after" ? 2 :
      submission.clientHistory.status === "no_match" ? 3 :
      submission.clientHistory.status === "no_phone" ? 4 : 5;
    case "attempts": return submission.attemptCount;
    case "history": return submission.events.length;
  }
}

const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium" });

function ClientHistoryCell({ submission }: { submission: SubmissionWithClientHistory }) {
  const { status, profiles, oldestPriorProfile } = submission.clientHistory;
  const label = status === "existing" ? "Existing client · over 90 days" :
    status === "recent" ? "Recent MoeGo client · within 90 days" :
    status === "created_after" ? "MoeGo profile created after submission" :
    status === "no_phone" ? "No valid phone to match" :
    status === "unavailable" ? "MoeGo history unavailable" : "No match in synced records";

  return <td className="min-w-56 max-w-72 px-4 py-3">
    <span className={status === "existing" ? "font-semibold text-amber-800" : "text-gray-700"}>{label}</span>
    {oldestPriorProfile && <div className="mt-1 text-xs text-gray-600">Oldest prior profile: {dateFormatter.format(oldestPriorProfile.createdTime)}</div>}
    {profiles.length > 0 && <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-blue-700">{profiles.length} matching MoeGo {profiles.length === 1 ? "profile" : "profiles"}</summary>
      <ul className="mt-1 space-y-1">
        {profiles.map((profile) => <li key={profile.moegoId}>
          <a className="hover:underline" href={`https://go.moego.pet/client/${encodeURIComponent(profile.moegoId)}/overview`} target="_blank" rel="noopener noreferrer">
            {profile.name || profile.moegoId} · {dateFormatter.format(profile.createdTime)}
          </a>
        </li>)}
      </ul>
    </details>}
  </td>;
}

type SubmissionTableProps = {
  submissions: SubmissionWithClientHistory[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  startDate: string;
  endDate: string;
};

function Pagination({ page, pageCount, startDate, endDate }: Pick<SubmissionTableProps, "page" | "pageCount" | "startDate" | "endDate">) {
  const pageHref = (target: number) => `/marketing/website-attribution/new-form-submissions?${new URLSearchParams({
    submissionStart: startDate, submissionEnd: endDate, page: String(target),
  })}`;
  const linkClass = "rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50";
  const disabledClass = "rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400";
  const firstVisible = Math.max(1, Math.min(page - 2, pageCount - 4));
  const visiblePages = Array.from({ length: Math.min(pageCount, 5) }, (_, index) => firstVisible + index);
  const lastVisible = visiblePages[visiblePages.length - 1];

  return <nav aria-label="Submission pages" className="flex flex-wrap items-center gap-3">
    {page > 1 ? <Link className={linkClass} href={pageHref(page - 1)}>Previous</Link> : <span className={disabledClass}>Previous</span>}
    {firstVisible > 1 && <><Link className={linkClass} href={pageHref(1)}>1</Link>{firstVisible > 2 && <span aria-hidden="true">…</span>}</>}
    {visiblePages.map((number) => number === page
      ? <span key={number} aria-current="page" className="rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white">{number}</span>
      : <Link key={number} className={linkClass} href={pageHref(number)}>{number}</Link>)}
    {lastVisible < pageCount && <>{lastVisible < pageCount - 1 && <span aria-hidden="true">…</span>}<Link className={linkClass} href={pageHref(pageCount)}>{pageCount}</Link></>}
    {page < pageCount ? <Link className={linkClass} href={pageHref(page + 1)}>Next</Link> : <span className={disabledClass}>Next</span>}
  </nav>;
}

export function SubmissionTable({ submissions, total, page, pageCount, pageSize, startDate, endDate }: SubmissionTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; direction: Direction }>({ key: "received", direction: "descending" });
  const [onlyExisting, setOnlyExisting] = useState(false);
  const historyAvailable = submissions.some((row) => row.clientHistory.status !== "unavailable");
  const sorted = useMemo(() => submissions.filter((row) => !onlyExisting || row.clientHistory.status === "existing").sort((a, b) => {
    const aValue = sortValue(a, sort.key);
    const bValue = sortValue(b, sort.key);
    const comparison = typeof aValue === "number" && typeof bValue === "number"
      ? aValue - bValue
      : collator.compare(String(aValue), String(bValue));
    if (comparison !== 0) return sort.direction === "ascending" ? comparison : -comparison;
    return b.receivedAt.getTime() - a.receivedAt.getTime() || collator.compare(b.id, a.id);
  }), [submissions, sort, onlyExisting]);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">Showing {total ? ((page - 1) * pageSize + 1).toLocaleString() : 0}–{Math.min(page * pageSize, total).toLocaleString()} of {total.toLocaleString()} submissions · {pageSize} per page</p>
        <Pagination page={page} pageCount={pageCount} startDate={startDate} endDate={endDate} />
      </div>
      <label className="mb-3 inline-flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={onlyExisting} disabled={!historyAvailable} onChange={(event) => setOnlyExisting(event.target.checked)} />
        Show only existing clients on this page (over 90 days before submission)
      </label>
      <p className="mb-2 text-xs text-gray-500">Column sorting applies to this page.</p>
      <div className="w-full max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[1600px] text-left text-sm">
          <thead className="bg-gray-50"><tr>
            {columns.map(({ key, label }) => {
              const active = sort.key === key;
              const nextDirection = active
                ? sort.direction === "ascending" ? "descending" : "ascending"
                : key === "received" ? "descending" : "ascending";
              return <th key={key} scope="col" aria-sort={active ? sort.direction : "none"} className="px-4 py-3 font-medium">
                <button type="button" className="inline-flex items-center gap-1 text-left hover:text-blue-700 focus-visible:rounded focus-visible:outline-2 focus-visible:outline-blue-600" aria-label={`${label}, sort ${nextDirection}`} onClick={() => setSort({ key, direction: nextDirection })}>
                  <span>{label}</span><span aria-hidden="true" className="text-gray-500">{active ? sort.direction === "ascending" ? "↑" : "↓" : "↕"}</span>
                </button>
              </th>;
            })}
          </tr></thead>
          <tbody>
            {sorted.map((submission) => (
              <tr key={submission.id} className="border-t border-gray-100 align-top">
                <td className="whitespace-nowrap px-4 py-3">{formatTime(submission.receivedAt)}<div className="mt-1 text-xs text-gray-500">Updated {formatTime(submission.updatedAt)}</div></td>
                <td className="max-w-48 break-words px-4 py-3">{[submission.firstName, submission.lastName].filter(Boolean).join(" ") || "Unvalidated"}<div className="mt-1 break-all text-xs text-gray-500">{submission.id}</div></td>
                <td className="max-w-52 break-all px-4 py-3">{submission.phone || "—"}<br />{submission.email || "—"}</td>
                <td className="max-w-64 break-words px-4 py-3">
                  {submission.pets.length ? submission.pets.map((pet, index) => {
                    const row = pet as { name?: string; breed?: string };
                    return <div key={index}>{row.name || "Unnamed"}{row.breed ? ` · ${row.breed}` : ""}</div>;
                  }) : "—"}
                  <div className="mt-1 text-xs text-gray-500">{submission.services.join(", ") || "No service selected"}</div>
                </td>
                <td className="px-4 py-3">{submission.marketingConsent === null ? "Unknown" : submission.marketingConsent ? "Yes" : "No"}</td>
                <td className="max-w-52 break-words px-4 py-3"><span className="font-medium">{submission.status}</span>{submission.lastHttpStatus && <div className="mt-1 text-xs text-gray-500">HTTP {submission.lastHttpStatus}</div>}{submission.lastError && <div className="mt-1 text-xs text-red-700">{submission.lastError}</div>}</td>
                <td className="max-w-48 break-all px-4 py-3">{submission.moegoLeadId || "Not confirmed"}{submission.moegoSyncedAt && <div className="mt-1 text-xs text-gray-500">Synced {formatTime(submission.moegoSyncedAt)}</div>}</td>
                <ClientHistoryCell submission={submission} />
                <td className="px-4 py-3 text-center">{submission.attemptCount}</td>
                <td className="min-w-64 max-w-96 px-4 py-3">
                  <details><summary className="cursor-pointer font-medium">{submission.events.length} events</summary><ol className="mt-2 space-y-2 text-xs">{submission.events.map((event) => <li key={event.id}><span className="font-medium">{formatTime(event.createdAt)} · {event.status}</span>{event.httpStatus && ` · HTTP ${event.httpStatus}`}{event.message && <div>{event.message}</div>}</li>)}</ol></details>
                  <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Full submitted payload</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs">{JSON.stringify(submission.payload, null, 2)}</pre></details>
                  <details className="mt-2"><summary className="cursor-pointer text-xs font-medium">Attribution and request metadata</summary><pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-gray-50 p-2 text-xs">{JSON.stringify({ attribution: submission.attribution, request: submission.requestMetadata }, null, 2)}</pre></details>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">{onlyExisting ? "No existing-client matches on this page." : "No saved new-client submissions in the selected date range."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end"><Pagination page={page} pageCount={pageCount} startDate={startDate} endDate={endDate} /></div>
    </>
  );
}
