export type ChartBucket = "day" | "week" | "month" | "quarter" | "year";
export const CHART_WEEKLY_EXPENSE_CENTS = 1_650_000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

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
