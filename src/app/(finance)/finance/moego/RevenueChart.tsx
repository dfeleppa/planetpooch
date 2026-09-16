"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { metricTrend } from "@/lib/moego/chart-profit";

type Bucket = "day" | "week" | "month" | "quarter" | "year";
type BucketChoice = Bucket | "auto";
const CURRENT_COLOR = "#2563eb";
const COMPARISON_COLOR = "#ffd43b";

type BucketRow = {
  date: string;
  revenueCents: number;
  expenseCents: number;
  profitCents: number;
  orders: number;
};

type ApiResponse = {
  from: string;
  to: string;
  bucket: Bucket;
  autoBucket: boolean;
  buckets: BucketRow[];
  weeklyExpenseCents: number;
  total: { revenueCents: number; expenseCents: number; profitCents: number; orders: number };
  comparison: { from: string; to: string; buckets: BucketRow[]; total: ApiResponse["total"] } | null;
  yearComparison: { from: string; to: string; total: ApiResponse["total"] };
};

const BUCKETS: { value: BucketChoice; label: string }[] = [
  { value: "auto", label: "Auto" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
];

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function YearTrend({ current, previous, lowerIsBetter = false, range }: {
  current: number; previous: number; lowerIsBetter?: boolean; range: string;
}) {
  const trend = metricTrend(current, previous, lowerIsBetter);
  const color = trend.favorable === null ? "text-gray-500" : trend.favorable ? "text-green-600" : "text-red-600";
  const arrow = trend.direction === "up" ? "↑" : trend.direction === "down" ? "↓" : "→";
  return (
    <p className={`mt-1 text-xs font-medium ${color}`} title={`Compared with ${range}, based on synced MoeGo orders. Percentage uses the absolute value of last year's baseline.`}>
      <span aria-label={trend.direction === "flat" ? "Unchanged" : trend.direction === "up" ? "Increase" : "Decrease"}>{arrow}</span>{" "}
      {dollars(Math.abs(trend.difference))} ({trend.percentage === null ? "N/A" : `${Math.abs(trend.percentage).toFixed(1)}%`}) vs last year
    </p>
  );
}

/// Bucket-aware date label. Quarter labels are computed client-side
/// from the month number (date_trunc('quarter', ts) returns Jan/Apr/
/// Jul/Oct of the quarter's first month).
function bucketLabel(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (bucket === "year") {
    return String(d.getUTCFullYear());
  }
  if (bucket === "quarter") {
    const q = Math.floor(d.getUTCMonth() / 3) + 1;
    return `Q${q} '${String(d.getUTCFullYear()).slice(-2)}`;
  }
  if (bucket === "month") {
    return d.toLocaleDateString("en-US", {
      month: "short",
      year: "2-digit",
      timeZone: "UTC",
    });
  }
  // day / week
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function RevenueChart({
  from,
  to,
  business,
}: {
  from: string;
  to: string;
  business: string;
}) {
  const [bucket, setBucket] = useState<BucketChoice>("auto");
  const [metric, setMetric] = useState<"sales" | "profit">("sales");
  const [compare, setCompare] = useState(false);
  const [chartType, setChartType] = useState<"bar" | "line">("bar");
  const title = metric === "sales" ? "Net Sales" : "Net Profit";
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!business) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    async function load() {
      setLoading(true);
      setData(null);
      setError(null);
      try {
        const params = new URLSearchParams({ from, to, bucket, business });
        if (compare) params.set("compare", "prior");
        const res = await fetch(
          `/api/finance/moego/revenue?${params.toString()}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setData((await res.json()) as ApiResponse);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load net sales");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [from, to, bucket, business, compare]);

  const value = (b: BucketRow) => metric === "sales" ? b.revenueCents : b.profitCents;
  const comparison = compare ? data?.comparison : null;
  const values = [...(data?.buckets.map(value) ?? []), ...(comparison?.buckets.map(value) ?? [])];
  const currentTotal = data ? (metric === "sales" ? data.total.revenueCents : data.total.profitCents) : 0;
  const priorTotal = comparison ? (metric === "sales" ? comparison.total.revenueCents : comparison.total.profitCents) : 0;
  const change = currentTotal - priorTotal;
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });
  const rangeLabel = (start: string, end: string) => `${formatDate(start)} - ${formatDate(new Date(new Date(end).getTime() - 1).toISOString())}`;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;

  /// SVG coordinate system. Wider than the chart wrapper would let us
  /// fit dense daily ranges without crowding, while still
  /// reading reasonably for sparse ranges (4–12 bars).
  const W = 900;
  const H = 260;
  const PAD = { top: 16, right: 12, bottom: 40, left: 64 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const yPosition = (v: number) => PAD.top + (max - v) / span * innerH;
  const zeroY = yPosition(0);
  const barCount = data?.buckets.length ?? 0;
  const barW = barCount > 0 ? innerW / barCount : 0;

  const yTicks =
    max !== min
      ? Array.from(new Set([0, ...[0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(min + span * f))])).sort((a, b) => a - b)
      : [0];

  /// X-axis labels: aim for ~6–10 labels regardless of bar count.
  /// Always include the first and last, plus evenly spaced middles.
  /// Rotate when bars are narrow so labels don't overlap.
  const labelStep = barCount > 0 ? Math.max(1, Math.ceil(barCount / 8)) : 1;
  const labelIndices = (() => {
    if (barCount === 0) return [] as number[];
    const out: number[] = [];
    for (let i = 0; i < barCount; i += labelStep) out.push(i);
    if (out[out.length - 1] !== barCount - 1) out.push(barCount - 1);
    return out;
  })();
  const rotateLabels = barCount > 0 && innerW / barCount < 60;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-4">
            <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {metric === "sales" ? "Subtotal minus discounts (excludes tax & tips)" : "Estimated net profit: net sales minus $16,500/week expenses, prorated daily to the selected dates"}, bucketed by{" "}
              <span className="font-medium">{data?.bucket ?? bucket}</span>
              {data?.autoBucket ? " (auto)" : ""}.
            </p>
            </div>
            <div role="group" aria-label="Chart type" className="flex shrink-0 gap-1 rounded-lg bg-gray-100 p-1">
              {(["bar", "line"] as const).map((type) => (
                <button key={type} type="button" aria-pressed={chartType === type}
                  onClick={() => setChartType(type)}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium ${chartType === type ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
                  {type === "bar" ? "Bar" : "Line"}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-xs font-medium text-gray-700">
              <input type="checkbox" checked={compare} onChange={e => setCompare(e.target.checked)} />
              Compare to prior period
            </label>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1" role="group" aria-label="Chart metric">
              {(["sales", "profit"] as const).map((m) => (
                <button key={m} type="button" aria-pressed={metric === m}
                  onClick={() => setMetric(m)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md ${metric === m ? "bg-white text-gray-900 shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
                  {m === "sales" ? "Net Sales" : "Net Profit"}
                </button>
              ))}
            </div>
            <span className="text-xs font-medium text-gray-700">Bucket</span>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {BUCKETS.map((b) => (
                <button
                  key={b.value}
                  type="button"
                  aria-pressed={bucket === b.value}
                  onClick={() => setBucket(b.value)}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    bucket === b.value
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-600 hover:text-gray-900"
                  }`}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {error && (
          <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
            {error}
          </div>
        )}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Net Sales
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data ? "—" : dollars(data.total.revenueCents)}
            </p>
            {!loading && data?.yearComparison && <YearTrend current={data.total.revenueCents} previous={data.yearComparison.total.revenueCents} range={rangeLabel(data.yearComparison.from, data.yearComparison.to)} />}
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Estimated Expenses
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data ? "—" : dollars(data.total.expenseCents)}
            </p>
            {!loading && data?.yearComparison && <YearTrend current={data.total.expenseCents} previous={data.yearComparison.total.expenseCents} lowerIsBetter range={rangeLabel(data.yearComparison.from, data.yearComparison.to)} />}
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Net Profit
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data ? "—" : dollars(data.total.profitCents)}
            </p>
            {!loading && data?.yearComparison && <YearTrend current={data.total.profitCents} previous={data.yearComparison.total.profitCents} range={rangeLabel(data.yearComparison.from, data.yearComparison.to)} />}
          </div>
        </div>
        {comparison && !loading && (
          <div className="mb-4 text-xs text-gray-600 space-y-1">
            <p>Prior {title.toLowerCase()}: {dollars(priorTotal)} · Change: {change > 0 ? "+" : ""}{dollars(change)}{priorTotal > 0 ? ` (${change > 0 ? "+" : ""}${(change / priorTotal * 100).toFixed(1)}%)` : " (percentage unavailable for zero or negative prior total)"}</p>
            <p>Prior {chartType === "bar" ? "bars" : "points"} aligned by elapsed time; each pair covers the same number of days.</p>
          </div>
        )}
        {loading && !data ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : !data || data.buckets.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No net sales in this range.
          </p>
        ) : (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto"
              preserveAspectRatio="none"
              role="img"
              aria-label={`${title} ${chartType} graph${comparison ? " with prior period comparison" : ""}`}
            >
              {/* Y-axis grid lines + labels */}
              {yTicks.map((v, i) => {
                const y = yPosition(v);
                return (
                  <g key={i}>
                    <line
                      x1={PAD.left}
                      x2={W - PAD.right}
                      y1={y}
                      y2={y}
                      stroke="#e5e7eb"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD.left - 6}
                      y={y + 4}
                      fontSize={10}
                      textAnchor="end"
                      fill="#6b7280"
                    >
                      {dollars(v)}
                    </text>
                  </g>
                );
              })}
              <line x1={PAD.left} x2={W - PAD.right} y1={zeroY} y2={zeroY} stroke="#9ca3af" strokeWidth={1.5} />
              {/* Current and prior series share the same timeline and scale. */}
              {(comparison ? [data.buckets, comparison.buckets] : [data.buckets]).map((rows, series) => (
                <g key={series}>
                  {chartType === "line" && <polyline
                    points={rows.map((b, i) => `${PAD.left + i * barW + barW / 2},${yPosition(value(b))}`).join(" ")}
                    fill="none"
                    stroke={series === 1 ? COMPARISON_COLOR : CURRENT_COLOR}
                    strokeWidth={2.5}
                    strokeDasharray={series === 1 ? "6 4" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />}
                  {rows.map((b, i) => chartType === "bar" ? (
                    <rect key={b.date}
                      x={PAD.left + i * barW + series * barW / (comparison ? 2 : 1) + 1}
                      y={Math.min(zeroY, yPosition(value(b)))}
                      width={Math.max(0.5, barW / (comparison ? 2 : 1) - 2)}
                      height={Math.abs(yPosition(value(b)) - zeroY)}
                      fill={series === 1 ? COMPARISON_COLOR : CURRENT_COLOR}
                      rx={1}>
                      <title>{`Sales: ${dollars(b.revenueCents)}\nExpenses: ${dollars(b.expenseCents)}\nProfit: ${dollars(b.profitCents)}`}</title>
                    </rect>
                  ) : (
                    <circle key={b.date}
                      cx={PAD.left + i * barW + barW / 2}
                      cy={yPosition(value(b))}
                      r={barCount > 60 ? 2 : 3.5}
                      fill={series === 1 ? COMPARISON_COLOR : CURRENT_COLOR}
                      stroke="white" strokeWidth={1}>
                      <title>
                        {`Sales: ${dollars(b.revenueCents)}\nExpenses: ${dollars(b.expenseCents)}\nProfit: ${dollars(b.profitCents)}`}
                      </title>
                    </circle>
                  ))}
                </g>
              ))}
              {/* X-axis labels: evenly spaced, rotated when crowded */}
              {labelIndices.map((i) => {
                const b = data.buckets[i];
                if (!b) return null;
                const cx = PAD.left + i * barW + barW / 2;
                if (rotateLabels) {
                  return (
                    <text
                      key={`xt-${i}`}
                      x={cx}
                      y={H - PAD.bottom + 14}
                      fontSize={10}
                      textAnchor="end"
                      fill="#6b7280"
                      transform={`rotate(-45 ${cx} ${H - PAD.bottom + 14})`}
                    >
                      {bucketLabel(b.date, data.bucket)}
                    </text>
                  );
                }
                return (
                  <text
                    key={`xt-${i}`}
                    x={cx}
                    y={H - 10}
                    fontSize={10}
                    textAnchor="middle"
                    fill="#6b7280"
                  >
                    {bucketLabel(b.date, data.bucket)}
                  </text>
                );
              })}
            </svg>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-gray-600" aria-label="Chart legend">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CURRENT_COLOR }} aria-hidden="true" />
                {rangeLabel(data.from, data.to)}
              </span>
              {comparison && (
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: COMPARISON_COLOR }} aria-hidden="true" />
                  {rangeLabel(comparison.from, comparison.to)} (Comparison)
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
