"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Bucket = "day" | "week" | "month" | "quarter" | "year";
type BucketChoice = Bucket | "auto";

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
  const formatDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="text-xs text-gray-500 mt-1">
              {metric === "sales" ? "Subtotal minus discounts (excludes tax & tips)" : "Estimated net profit: net sales minus $16,500/week expenses, prorated daily to the selected dates"}, bucketed by{" "}
              <span className="font-medium">{data?.bucket ?? bucket}</span>
              {data?.autoBucket ? " (auto)" : ""}.
            </p>
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
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Estimated Expenses
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data ? "—" : dollars(data.total.expenseCents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Net Profit
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data ? "—" : dollars(data.total.profitCents)}
            </p>
          </div>
        </div>
        {comparison && !loading && (
          <div className="mb-4 text-xs text-gray-600 space-y-1">
            <p><span className="text-blue-600">— Current period</span> · <span className="text-slate-500">- - Prior period: {formatDate(comparison.from)} – {formatDate(new Date(new Date(comparison.to).getTime() - 1).toISOString())}</span></p>
            <p>Prior {title.toLowerCase()}: {dollars(priorTotal)} · Change: {change > 0 ? "+" : ""}{dollars(change)}{priorTotal > 0 ? ` (${change > 0 ? "+" : ""}${(change / priorTotal * 100).toFixed(1)}%)` : " (percentage unavailable for zero or negative prior total)"}</p>
            <p>Prior points aligned by elapsed time; each pair covers the same number of days.</p>
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
              aria-label={`${title} line graph${comparison ? " with prior period comparison" : ""}`}
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
                  <polyline
                    points={rows.map((b, i) => `${PAD.left + i * barW + barW / 2},${yPosition(value(b))}`).join(" ")}
                    fill="none"
                    stroke={series === 1 ? "#64748b" : "#2563eb"}
                    strokeWidth={2.5}
                    strokeDasharray={series === 1 ? "6 4" : undefined}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {rows.map((b, i) => (
                    <circle key={b.date}
                      cx={PAD.left + i * barW + barW / 2}
                      cy={yPosition(value(b))}
                      r={barCount > 60 ? 2 : 3.5}
                      fill={series === 1 ? "#64748b" : "#2563eb"}
                      stroke="white" strokeWidth={1}>
                      <title>
                        {series === 1 ? "Prior period, aligned with " : "Current period: "}{bucketLabel(b.date, data.bucket)} — {title}: {dollars(value(b))} · {b.orders} order{b.orders === 1 ? "" : "s"}
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
          </div>
        )}
      </CardContent>
    </Card>
  );
}
