import { addCalendarDays, formatEasternDate } from "@/lib/marketing/submission-date-range";

export type ReportSource = "all" | "meta" | "google-ads" | "google-lsa";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value?: string): value is string {
  if (!value || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function reportingRange(query: { days?: string; from?: string; to?: string; range?: string; source?: string; month?: string; year?: string }) {
  const source: ReportSource = query.source === "meta" || query.source === "google-ads" || query.source === "google-lsa"
    ? query.source : "all";
  if (validDate(query.from) && validDate(query.to) && query.from <= query.to) {
    return { from: query.from, to: query.to, source, days: null, label: `${query.from} to ${query.to}` };
  }
  if (query.range === "2026-through-sep-5") {
    return { from: "2026-01-01", to: "2026-09-05", source, days: null, label: "Jan 1 – Sep 5, 2026" };
  }
  const month = Number(query.month);
  const year = Number(query.year);
  if (Number.isInteger(month) && month >= 1 && month <= 12 && Number.isInteger(year) && year >= 2020 && year <= 2100) {
    const from = `${year}-${String(month).padStart(2, "0")}-01`;
    const end = new Date(Date.UTC(year, month, 0));
    const to = year === 2026 && month === 9 ? "2026-09-05" : end.toISOString().slice(0, 10);
    const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(end);
    return { from, to, source, days: null, label: year === 2026 && month === 9 ? "Sep 1–5, 2026" : monthLabel };
  }
  const days = query.days === "7" || query.days === "90" ? Number(query.days) : 30;
  const today = formatEasternDate(new Date());
  return { from: addCalendarDays(today, 1 - days)!, to: today, source, days, label: `Last ${days} calendar days` };
}
