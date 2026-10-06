"use client";

import { useEffect, useState } from "react";

type Bucket = { date: string; profitCents: number };
type ChartData = { buckets: Bucket[]; total: { profitCents: number } };

export function NetProfitChart({ from, to, business }: { from: string; to: string; business: string }) {
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const params = new URLSearchParams({ from, to, business, bucket: "week" });
    fetch(`/api/finance/moego/revenue?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load net profit");
        return response.json() as Promise<ChartData>;
      })
      .then(setData)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load net profit");
      });
    return () => controller.abort();
  }, [from, to, business]);

  const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(cents / 100);
  const buckets = data?.buckets ?? [];
  const values = buckets.map((bucket) => bucket.profitCents);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const y = (value: number) => 18 + ((max - value) / span) * 166;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Net Profit</h3>
          <p className="text-sm text-gray-500">Current quarter · weekly</p>
        </div>
        <a href={`/finance/profit-loss?from=${from}&to=${to}`} className="text-sm font-medium text-blue-700 hover:underline">View Profit &amp; Loss →</a>
      </div>
      {error ? <p className="mt-6 text-sm text-red-600">{error}</p> : !data ? <p className="mt-6 text-sm text-gray-500">Loading chart…</p> : (
        <>
          <p className="mt-5 text-2xl font-semibold tabular-nums text-gray-900">{money(data.total.profitCents)}</p>
          <div className="mt-4 overflow-x-auto">
            <svg viewBox="0 0 800 220" className="min-w-[520px] w-full" role="img" aria-label={`Weekly net profit for the current quarter, total ${money(data.total.profitCents)}`}>
              <line x1="24" x2="790" y1={y(0)} y2={y(0)} stroke="#cbd5e1" />
              {buckets.map((bucket, index) => {
                const width = 760 / Math.max(buckets.length, 1);
                const x = 28 + index * width + width * 0.15;
                const top = Math.min(y(0), y(bucket.profitCents));
                return <g key={bucket.date}>
                  <rect x={x} y={top} width={width * 0.7} height={Math.max(1, Math.abs(y(0) - y(bucket.profitCents)))} rx="3" fill={bucket.profitCents < 0 ? "#dc2626" : "#2563eb"}>
                    <title>{`${new Date(bucket.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}: ${money(bucket.profitCents)}`}</title>
                  </rect>
                  {(index % Math.max(1, Math.ceil(buckets.length / 7)) === 0) && <text x={x} y="210" fontSize="11" fill="#64748b">{new Date(bucket.date).toLocaleDateString("en-US", { month: "numeric", day: "numeric", timeZone: "UTC" })}</text>}
                </g>;
              })}
            </svg>
          </div>
        </>
      )}
    </div>
  );
}
