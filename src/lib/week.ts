// Week helpers for KPI reports. A "week" is identified by its Sunday at
// 00:00 UTC. Everything is computed in UTC because the weekStart column is a
// Prisma @db.Date, which round-trips as a UTC-midnight Date — using local-time
// constructors/getters here would shift the day by one for users west of UTC.

const MS_PER_DAY = 86_400_000;

export function weekStartOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay()); // shift back to Sunday (0 = Sun)
  return d;
}

export function addWeeks(weekStart: Date, weeks: number): Date {
  return new Date(weekStart.getTime() + weeks * 7 * MS_PER_DAY);
}

export function currentWeekStart(): Date {
  return weekStartOf(new Date());
}

export function toWeekParam(weekStart: Date): string {
  return weekStart.toISOString().slice(0, 10);
}

export function fromWeekParam(value: string): Date {
  return weekStartOf(new Date(`${value}T00:00:00.000Z`));
}

export function isValidWeekParam(value: string | undefined | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function formatWeekLabel(weekStart: Date): string {
  return `Week of ${weekStart.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
}

// The Saturday that ends the week, for compact range labels like "May 17 – 23".
export function formatWeekRange(weekStart: Date): string {
  const saturday = new Date(weekStart.getTime() + 6 * MS_PER_DAY);
  const start = weekStart.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
  const end = saturday.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
  return `${start} – ${end}`;
}

// Most-recent-first list of the last `n` week-starts (including the current week).
export function recentWeeks(n = 12): Date[] {
  const start = currentWeekStart();
  return Array.from({ length: n }, (_, i) => addWeeks(start, -i));
}

// Years from the current year back to `floor` (default 3 years), newest first.
export function yearsRange(floor?: number): number[] {
  const current = new Date().getUTCFullYear();
  const min = floor ?? current - 3;
  const out: number[] = [];
  for (let y = current; y >= min; y--) out.push(y);
  return out;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function monthsForYear(): number[] {
  return Array.from({ length: 12 }, (_, m) => m);
}

// Week-start Sundays that fall within the given year + month (0-based).
export function weeksInMonth(year: number, month: number): Date[] {
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  let weekStart = weekStartOf(firstOfMonth);
  if (weekStart.getTime() < firstOfMonth.getTime()) weekStart = addWeeks(weekStart, 1);
  const out: Date[] = [];
  while (weekStart.getUTCFullYear() === year && weekStart.getUTCMonth() === month) {
    out.push(weekStart);
    weekStart = addWeeks(weekStart, 1);
  }
  return out;
}
