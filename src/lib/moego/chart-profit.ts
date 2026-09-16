export type ChartBucket = "day" | "week" | "month" | "quarter" | "year";
export const CHART_WEEKLY_EXPENSE_CENTS = 1_650_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function shiftYear(date: Date, years: number) {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

// Shift inclusive endpoint dates, then restore the exclusive query boundary.
// Feb 29 maps to Feb 28 in a non-leap year rather than spilling into March.
export function yearAgoPeriod(from: Date, to: Date) {
  return { from: shiftYear(from, -1), to: new Date(shiftYear(new Date(to.getTime() - 1), -1).getTime() + 1) };
}

// Aggregate historical daily sales onto the current calendar's buckets.
// Allocate expenses over actual historical days, including leap years.
export function yearAgoBuckets(from: Date, to: Date, bucket: ChartBucket,
  rows: { date: Date; revenueCents: number; orders: number }[]) {
  const range = yearAgoPeriod(from, to);
  const byDay = new Map(rows.map(r => [r.date.toISOString(), r]));
  const buckets = profitBuckets(from, to, bucket, []).map(b => ({ ...b, expenseCents: 0, profitCents: 0 }));
  const byBucket = new Map(buckets.map(b => [b.date, b]));
  let allocated = 0;
  for (let day = bucketStart(range.from, "day"); day < range.to; day = nextBucket(day, "day")) {
    const end = Math.min(nextBucket(day, "day").getTime(), range.to.getTime());
    const cumulative = Math.round((end - range.from.getTime()) / WEEK_MS * CHART_WEEKLY_EXPENSE_CENTS);
    const mapped = shiftYear(day, 1);
    const aligned = new Date(Math.max(from.getTime(), Math.min(to.getTime() - 1, mapped.getTime())));
    const target = byBucket.get(bucketStart(aligned, bucket).toISOString())!;
    const row = byDay.get(day.toISOString());
    target.revenueCents += row?.revenueCents ?? 0;
    target.orders += row?.orders ?? 0;
    target.expenseCents += cumulative - allocated;
    allocated = cumulative;
  }
  return buckets.map(b => ({ ...b, profitCents: b.revenueCents - b.expenseCents }));
}

export function metricTrend(current: number, previous: number, lowerIsBetter = false) {
  const difference = current - previous;
  return {
    difference,
    percentage: previous === 0 ? null : difference / Math.abs(previous) * 100,
    direction: difference > 0 ? "up" : difference < 0 ? "down" : "flat",
    favorable: difference === 0 ? null : lowerIsBetter ? difference < 0 : difference > 0,
  };
}

export function priorPeriod(from: Date, to: Date) {
  const durationMs = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - durationMs), to: new Date(from), durationMs };
}

function bucketStart(date: Date, bucket: ChartBucket): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  if (bucket === "week") d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  if (bucket === "month" || bucket === "quarter" || bucket === "year") d.setUTCDate(1);
  if (bucket === "quarter") d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3);
  if (bucket === "year") d.setUTCMonth(0);
  return d;
}

function nextBucket(date: Date, bucket: ChartBucket): Date {
  const d = new Date(date);
  if (bucket === "day" || bucket === "week") d.setUTCDate(d.getUTCDate() + (bucket === "day" ? 1 : 7));
  else d.setUTCMonth(d.getUTCMonth() + (bucket === "month" ? 1 : bucket === "quarter" ? 3 : 12));
  return d;
}

// `to` is exclusive, matching the revenue query. Fill empty periods too:
// expenses still accrue when no orders were placed. Cumulative rounding
// keeps bucket expenses equal to the range expense for every granularity.
export function profitBuckets(
  from: Date, to: Date, bucket: ChartBucket,
  rows: { date: Date; revenueCents: number; orders: number }[],
) {
  const byDate = new Map(rows.map(r => [r.date.toISOString(), r]));
  const result = [];
  let allocated = 0;
  for (let start = bucketStart(from, bucket); start < to; start = nextBucket(start, bucket)) {
    const end = Math.min(nextBucket(start, bucket).getTime(), to.getTime());
    const cumulative = Math.round((end - from.getTime()) / WEEK_MS * CHART_WEEKLY_EXPENSE_CENTS);
    const expenseCents = cumulative - allocated;
    allocated = cumulative;
    const row = byDate.get(start.toISOString());
    const revenueCents = row?.revenueCents ?? 0;
    result.push({ date: start.toISOString(), revenueCents, orders: row?.orders ?? 0,
      expenseCents, profitCents: revenueCents - expenseCents });
  }
  return result;
}
