"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

type Customer = {
  moegoId: string;
  name: string | null;
  email: string | null;
  mainPhoneNumber: string | null;
  leadSource: string | null;
  preferredBusinessId: string | null;
  lastAppointmentDate: string | null;
  nextAppointmentDate: string | null;
  tags: string[];
  createdTime: string;
  lastUpdatedTime: string | null;
  syncedAt: string;
};

type Order = {
  moegoId: string;
  businessId: string | null;
  status: string | null;
  subTotalCents: number;
  totalCents: number;
  paidCents: number;
  refundedCents: number;
  taxCents: number;
  discountCents: number;
  tipsCents: number;
  createdTime: string;
  salesDatetime: string | null;
  completedTime: string | null;
  lastUpdatedTime: string | null;
};

type Lead = {
  moegoId: string;
  name: string | null;
  referralSource: string | null;
  lifeCycleId: string | null;
  actionStatusId: string | null;
  createdTime: string;
};

type Aggregates = {
  orderCount: number;
  totalPaidCents: number;
  totalRefundedCents: number;
  totalInvoicedCents: number;
  avgOrderCents: number;
  firstOrderTime: string | null;
  lastOrderTime: string | null;
};

type ApiResponse = {
  customer: Customer;
  orders: Order[];
  matchedLead: Lead | null;
  aggregates: Aggregates;
};

function dollars(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function dateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CustomerDetail({ moegoId }: { moegoId: string }) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/finance/moego/customers/${encodeURIComponent(moegoId)}`,
          { cache: "no-store" }
        );
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        if (!cancelled) setData((await res.json()) as ApiResponse);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load customer");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [moegoId]);

  if (loading) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }
  if (error) {
    return (
      <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
        {error}
      </div>
    );
  }
  if (!data) return null;

  const { customer, orders, matchedLead, aggregates } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Lifetime Value
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {dollars(aggregates.totalPaidCents)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              refunded: {dollars(aggregates.totalRefundedCents)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Orders
            </p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {aggregates.orderCount}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              avg: {dollars(aggregates.avgOrderCents)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              First Order
            </p>
            <p className="text-base font-semibold text-gray-900 mt-1">
              {shortDate(aggregates.firstOrderTime)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              acquired: {shortDate(customer.createdTime)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">
              Last Order
            </p>
            <p className="text-base font-semibold text-gray-900 mt-1">
              {shortDate(aggregates.lastOrderTime)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              invoiced: {dollars(aggregates.totalInvoicedCents)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">Contact</h2>
          </CardHeader>
          <CardContent className="pt-0">
            <dl className="text-sm space-y-2">
              <Row label="Name" value={customer.name} />
              <Row label="Email" value={customer.email} />
              <Row label="Phone" value={customer.mainPhoneNumber} />
              <Row label="Lead source" value={customer.leadSource} />
              <Row
                label="Preferred location"
                value={customer.preferredBusinessId}
                mono
              />
              <Row
                label="Last appointment"
                value={shortDate(customer.lastAppointmentDate)}
              />
              <Row
                label="Next appointment"
                value={shortDate(customer.nextAppointmentDate)}
              />
              <div className="flex justify-between gap-3">
                <dt className="text-gray-500">Tags</dt>
                <dd className="text-right">
                  {customer.tags.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1 justify-end">
                      {customer.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-700 text-xs"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </dd>
              </div>
              <Row label="MoeGo ID" value={customer.moegoId} mono />
              <Row label="Last updated" value={dateTime(customer.lastUpdatedTime)} />
              <Row label="Synced" value={dateTime(customer.syncedAt)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-900">
              Matched lead
            </h2>
            <p className="text-xs text-gray-500 mt-1">
              {matchedLead
                ? "Joined by phone number."
                : "No lead matches this customer's phone — lead source comes only from the customer's own field, if set."}
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            {matchedLead ? (
              <dl className="text-sm space-y-2">
                <Row label="Name" value={matchedLead.name} />
                <Row
                  label="Referral source"
                  value={matchedLead.referralSource}
                />
                <Row label="Lifecycle" value={matchedLead.lifeCycleId} mono />
                <Row label="Action status" value={matchedLead.actionStatusId} mono />
                <Row label="Created" value={dateTime(matchedLead.createdTime)} />
                <Row label="MoeGo ID" value={matchedLead.moegoId} mono />
              </dl>
            ) : (
              <p className="text-sm text-gray-400">No matched lead.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-sm font-semibold text-gray-900">
            Orders ({orders.length})
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Every invoice for this customer, newest first.
          </p>
        </CardHeader>
        <CardContent className="pt-0">
          {orders.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">
              No orders yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wide border-b border-gray-200">
                    <th className="py-2 font-medium">Date</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium text-right">Subtotal</th>
                    <th className="py-2 font-medium text-right">Total</th>
                    <th className="py-2 font-medium text-right">Paid</th>
                    <th className="py-2 font-medium text-right">Refunded</th>
                    <th className="py-2 font-medium font-mono">MoeGo ID</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr
                      key={o.moegoId}
                      className="border-b border-gray-100 last:border-b-0"
                    >
                      <td className="py-2 text-gray-700 text-xs">
                        {shortDate(o.createdTime)}
                      </td>
                      <td className="py-2 text-gray-700 text-xs">
                        {o.status ?? "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-700">
                        {dollars(o.subTotalCents)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900">
                        {dollars(o.totalCents)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-900 font-medium">
                        {dollars(o.paidCents)}
                      </td>
                      <td className="py-2 text-right tabular-nums text-gray-500">
                        {o.refundedCents > 0
                          ? dollars(o.refundedCents)
                          : "—"}
                      </td>
                      <td className="py-2 text-gray-400 text-xs font-mono">
                        {o.moegoId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd
        className={`text-gray-900 text-right ${mono ? "font-mono text-xs" : ""}`}
      >
        {value && value.trim() ? value : <span className="text-gray-400">—</span>}
      </dd>
    </div>
  );
}
