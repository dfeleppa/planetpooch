export function yearToDateRange(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => parts.find(p => p.type === name)!.value;
  const year = part("year");
  return { from: `${year}-01-01`, to: `${year}-${part("month")}-${part("day")}` };
}

export type ChartRangePreset =
  | "last-week"
  | "last-month"
  | "last-year"
  | "7-days"
  | "30-days"
  | "90-days"
  | "year-to-date"
  | "1-year"
  | "2-years"
  | "all";

const MS_PER_DAY = 86_400_000;

function easternDate(now: Date): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (name: string) => Number(parts.find((p) => p.type === name)!.value);
  return new Date(Date.UTC(part("year"), part("month") - 1, part("day")));
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

export function chartPresetRange(preset: ChartRangePreset, now = new Date()) {
  const today = easternDate(now);

  if (preset === "year-to-date") return yearToDateRange(now);
  if (preset === "last-week") {
    const currentSunday = addDays(today, -today.getUTCDay());
    return { from: ymd(addDays(currentSunday, -7)), to: ymd(addDays(currentSunday, -1)) };
  }
  if (preset === "last-month") {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
    const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0));
    return { from: ymd(from), to: ymd(to) };
  }
  if (preset === "last-year") {
    const year = today.getUTCFullYear() - 1;
    return { from: `${year}-01-01`, to: `${year}-12-31` };
  }

  const rollingDays = {
    "7-days": 7,
    "30-days": 30,
    "90-days": 90,
    "1-year": 365,
    "2-years": 730,
    all: 3650,
  }[preset];
  return { from: ymd(addDays(today, -(rollingDays - 1))), to: ymd(today) };
}
