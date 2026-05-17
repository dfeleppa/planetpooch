"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Range = "7d" | "30d" | "90d" | "365d" | "730d" | "all";
type Bucket = "day" | "week" | "month";

type BucketRow = {
  date: string; // ISO timestamp at the start of the bucket
  revenueCents: number;
  orders: number;
};

type ApiResponse = {
  range: Range;
  bucket: Bucket;
  buckets: BucketRow[];
  total: { revenueCents: number; orders: number };
};

const RANGES: { value: Range; label: string }[] = [
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "365d", label: "1y" },
  { value: "730d", label: "2y" },
  { value: "all", label: "All" },
];

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function bucketLabel(iso: string, bucket: Bucket): string {
  const d = new Date(iso);
  if (bucket === "day") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (bucket === "week") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function RevenueChart() {
  const [range, setRange] = useState<Range>("30d");
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/finance/moego/revenue?range=${range}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setData((await res.json()) as ApiResponse);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load revenue");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [range]);

  const max =
    data && data.buckets.length > 0
      ? Math.max(...data.buckets.map((b) => b.revenueCents))
      : 0;

  /// SVG plays well with `viewBox` for crisp scaling; pick a coordinate
  /// system that fits the data without recomputing pixel sizes on every
  /// resize.
  const W = 800;
  const H = 220;
  const PAD = { top: 16, right: 8, bottom: 24, left: 56 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const barCount = data?.buckets.length ?? 0;
  const barW = barCount > 0 ? innerW / barCount : 0;
  const gap = barCount > 60 ? 0.5 : barCount > 30 ? 1 : 2;

  /// Y-axis ticks: 4 evenly spaced including 0 and max, rounded to a
  /// presentable number. Pure visual aid; we recompute each render.
  const yTicks =
    max > 0
      ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f))
      : [0];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              Revenue
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              Paid amount across all orders, bucketed by{" "}
              {data?.bucket ?? "day"} (created date).
            </p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setRange(r.value)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  range === r.value
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {r.label}
              </button>
            ))}
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
              Total revenue
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data ? "—" : dollars(data.total.revenueCents)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Orders
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data ? "—" : data.total.orders.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Avg order
            </p>
            <p className="text-2xl font-bold text-gray-900">
              {loading || !data || data.total.orders === 0
                ? "—"
                : dollars(
                    Math.round(data.total.revenueCents / data.total.orders)
                  )}
            </p>
          </div>
        </div>
        {loading && !data ? (
          <p className="text-sm text-gray-400 py-6 text-center">Loading…</p>
        ) : !data || data.buckets.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No revenue in this range.
          </p>
        ) : (
          <div className="w-full overflow-x-auto">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full h-auto"
              preserveAspectRatio="none"
            >
              {/* Y-axis grid lines + labels */}
              {yTicks.map((v, i) => {
                const y = PAD.top + innerH - (max > 0 ? (v / max) * innerH : 0);
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
              {/* Bars */}
              {data.buckets.map((b, i) => {
                const x = PAD.left + i * barW + gap / 2;
                const w = Math.max(1, barW - gap);
                const h = max > 0 ? (b.revenueCents / max) * innerH : 0;
                const y = PAD.top + innerH - h;
                return (
                  <rect
                    key={b.date}
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill="#2563eb"
                    rx={1}
                  >
                    <title>
                      {bucketLabel(b.date, data.bucket)} —{" "}
                      {dollars(b.revenueCents)} · {b.orders} order
                      {b.orders === 1 ? "" : "s"}
                    </title>
                  </rect>
                );
              })}
              {/* X-axis sparse labels: first, middle, last */}
              {(() => {
                if (data.buckets.length === 0) return null;
                const indices = [
                  0,
                  Math.floor((data.buckets.length - 1) / 2),
                  data.buckets.length - 1,
                ];
                return indices.map((i) => {
                  if (data.buckets[i] === undefined) return null;
                  const x = PAD.left + i * barW + barW / 2;
                  return (
                    <text
                      key={`xt-${i}`}
                      x={x}
                      y={H - 6}
                      fontSize={10}
                      textAnchor="middle"
                      fill="#6b7280"
                    >
                      {bucketLabel(data.buckets[i].date, data.bucket)}
                    </text>
                  );
                });
              })()}
            </svg>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
