import { chartPresetRange } from "@/lib/moego/chart-date-range";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";
import { orderDateRange } from "@/lib/knowledge-app-data";

export type ReportPeriod = {
  start: string;
  end: string;
  label: string;
  kind: "day" | "week" | "month" | "quarter" | "year" | "range";
  quarterEnd?: string;
};

/** Completed Sunday–Saturday weeks, most recent first, in Eastern calendar time. */
export function completedReportWeeks(count: number, now = new Date()): ReportPeriod[] {
  const latest = chartPresetRange("last-week", now);
  const start = new Date(`${latest.from}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const sunday = new Date(start.getTime() - index * 7 * 86_400_000);
    const saturday = new Date(sunday.getTime() + 6 * 86_400_000);
    const from = sunday.toISOString().slice(0, 10);
    const to = saturday.toISOString().slice(0, 10);
    return { start: from, end: to, label: `week ending ${to}`, kind: "week" as const };
  });
}

export function reportQuarter(question: string, now = new Date()): ReportPeriod | null {
  const match = question.match(/\b(?:q\s*([1-4])|quarter\s*([1-4])|(?:first|second|third|fourth)\s+quarter)\b/i);
  const relative = question.match(/\b(this|current|last|previous|prior) quarter\b/i);
  if (!match && !relative) return null;
  const today = formatEasternDate(now);
  const currentQuarter = Math.floor((Number(today.slice(5, 7)) - 1) / 3) + 1;
  const ordinal = match?.[0].toLowerCase().match(/first|second|third|fourth/)?.[0];
  let quarter = match
    ? Number(match[1] ?? match[2] ?? ({ first: 1, second: 2, third: 3, fourth: 4 } as Record<string, number>)[ordinal ?? ""])
    : currentQuarter;
  const explicitYear = question.match(/\b20\d{2}\b/)?.[0];
  let year = explicitYear ? Number(explicitYear) : Number(today.slice(0, 4)) - (/\b(?:last|prior|previous) year\b/i.test(question) ? 1 : 0);
  if (!match && /\b(?:last|prior|previous) quarter\b/i.test(question)) {
    quarter -= 1;
    if (quarter === 0) { quarter = 4; year -= 1; }
  }
  const start = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
  const quarterEnd = new Date(Date.UTC(year, quarter * 3, 0)).toISOString().slice(0, 10);
  const future = start > today;
  return { start, end: future || quarterEnd < today ? quarterEnd : today,
    label: `Q${quarter} ${year}${future ? " (upcoming)" : quarterEnd > today ? " to date" : ""}`, kind: "quarter", quarterEnd };
}

export function reportPeriod(question: string, now = new Date()): ReportPeriod | null {
  const quarter = reportQuarter(question, now);
  if (quarter) return quarter;
  if (/\b(?:previous|prior) completed week\b/i.test(question)) return completedReportWeeks(2, now)[1];
  if (/\b(?:last|most recent) completed week\b/i.test(question)) return completedReportWeeks(1, now)[0];
  const ending = question.match(/\b(?:week[\s-]*(?:ending|ended|end)|w\/e)\s*(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
  if (ending) {
    const today = formatEasternDate(now);
    const rawYear = ending[3] ? Number(ending[3]) : Number(today.slice(0, 4));
    let year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const iso = () => `${year}-${ending[1].padStart(2, "0")}-${ending[2].padStart(2, "0")}`;
    if (!ending[3] && iso() > today) year -= 1;
    const endDate = new Date(`${iso()}T00:00:00.000Z`);
    if (Number.isNaN(endDate.getTime()) || endDate.toISOString().slice(0, 10) !== iso()) return null;
    const startDate = new Date(endDate);
    startDate.setUTCDate(startDate.getUTCDate() - 6);
    return { start: startDate.toISOString().slice(0, 10), end: iso(), label: `week ending ${iso()}`, kind: "week" };
  }
  const namedDay = question.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(20\d{2})\b/i);
  if (namedDay) {
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
      .indexOf(namedDay[1].toLowerCase().slice(0, 3)) + 1;
    const iso = `${namedDay[3]}-${String(month).padStart(2, "0")}-${namedDay[2].padStart(2, "0")}`;
    const parsed = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) return null;
    return { start: iso, end: iso, label: iso, kind: "day" };
  }
  const monthMatch = question.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s*(20\d{2})?\b/i);
  if (monthMatch) {
    const monthName = monthMatch[1].toLowerCase().slice(0, 3);
    const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(monthName) + 1;
    const today = formatEasternDate(now);
    let year = monthMatch[2] ? Number(monthMatch[2]) : Number(today.slice(0, 4));
    let start = `${year}-${String(month).padStart(2, "0")}-01`;
    if (!monthMatch[2] && start > today) { year -= 1; start = `${year}-${String(month).padStart(2, "0")}-01`; }
    const fullEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    const future = start > today;
    return { start, end: future || fullEnd < today ? fullEnd : today,
      label: `${monthMatch[1]} ${year}${future ? " (upcoming)" : fullEnd > today ? " to date" : ""}`, kind: "month" };
  }
  const explicitYear = question.match(/\b(?:year|in)\s+(20\d{2})\b/i)?.[1];
  if (explicitYear) {
    const today = formatEasternDate(now);
    const start = `${explicitYear}-01-01`;
    const fullEnd = `${explicitYear}-12-31`;
    const future = start > today;
    return { start, end: future || fullEnd < today ? fullEnd : today,
      label: `${explicitYear}${future ? " (upcoming)" : fullEnd > today ? " to date" : ""}`, kind: "year" };
  }
  const range = orderDateRange(question, now);
  if (range) return { ...range, label: `${range.start} to ${range.end}`,
    kind: /\bweek\b/i.test(question) ? "week" : /\bmonth\b/i.test(question) ? "month"
      : /\byear\b|\bytd\b/i.test(question) ? "year" : range.start === range.end ? "day" : "range" };
  return null;
}

export function defaultProfitPeriod(now = new Date()): ReportPeriod {
  const range = chartPresetRange("30-days", now);
  return { start: range.from, end: range.to, label: `${range.from} to ${range.to}`, kind: "range" };
}
