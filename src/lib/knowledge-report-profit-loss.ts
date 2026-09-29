import { BUSINESSES } from "@/lib/business";
import { getActiveBusiness } from "@/lib/business-server";
import type { KnowledgeSource } from "@/lib/knowledge";
import { findQuarterRevenueSource, quarterRevenueRange } from "@/lib/knowledge-finance";
import { defaultProfitPeriod, reportPeriod } from "@/lib/knowledge-report-period";
import { getProfitLossTotals } from "@/lib/moego/profit-loss-totals";
import { prisma } from "@/lib/prisma";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";

type ProfitMetric = "net sales" | "orders" | "estimated expenses" | "net profit";

export function profitMetric(question: string): ProfitMetric | null {
  if (/\b(?:net profit|profit|earnings)\b/i.test(question)) return "net profit";
  if (/\b(?:estimated expenses?|expenses?|operating costs?|costs?)\b/i.test(question)) return "estimated expenses";
  if (/\b(?:order count|number of orders|how many orders)\b/i.test(question)) return "orders";
  if (/\b(?:net sales|revenue|total sales|income)\b/i.test(question)) return "net sales";
  return null;
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export async function findProfitLossReport(question: string): Promise<KnowledgeSource[]> {
  const metric = profitMetric(question);
  if (!metric) return [];
  const requestedMetrics = [
    /\b(?:net profit|profit|earnings)\b/i.test(question),
    /\b(?:estimated expenses?|expenses?|operating costs?|costs?)\b/i.test(question),
    /\b(?:order count|number of orders|how many orders)\b/i.test(question),
    /\b(?:net sales|revenue|total sales|income)\b/i.test(question),
  ].filter(Boolean).length;
  if (metric === "net sales" && requestedMetrics === 1 && quarterRevenueRange(question)) {
    return findQuarterRevenueSource(question);
  }
  const period = reportPeriod(question) ?? defaultProfitPeriod();
  if (period.start > formatEasternDate(new Date())) return [{
    id: `record:report:profit-loss:future:${period.start}`,
    title: `Profit & Loss report: ${period.label}`,
    kind: "record", url: "/finance/profit-loss",
    excerpt: `${period.label} has not started, so the report has no actual net sales or profit for it.`,
    updatedAt: new Date().toISOString(), dateKind: "entry",
    answer: `${period.label} has not started, so there is no actual Profit & Loss result yet. [1]`,
  }];
  const active = await getActiveBusiness();
  const explicit = /\bmobile[ -]?grooming\b/i.test(question) ? BUSINESSES[1]
    : /\bpet[ -]?resort\b/i.test(question) ? BUSINESSES[0] : null;
  const combined = /\b(?:both businesses|all businesses|combined|company[ -]?wide)\b/i.test(question);
  const businesses = combined ? [...BUSINESSES] : [explicit ?? active];
  const from = new Date(`${period.start}T00:00:00.000Z`);
  const to = new Date(new Date(`${period.end}T00:00:00.000Z`).getTime() + 86_400_000);
  const [totals, sync] = await Promise.all([
    Promise.all(businesses.map(async (business) => ({ business,
      total: await getProfitLossTotals(business.moegoId, from, to) }))),
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
  ]);
  const combinedTotal = totals.reduce((sum, row) => ({
    revenueCents: sum.revenueCents + row.total.revenueCents,
    expenseCents: sum.expenseCents + row.total.expenseCents,
    profitCents: sum.profitCents + row.total.profitCents,
    orders: sum.orders + row.total.orders,
  }), { revenueCents: 0, expenseCents: 0, profitCents: 0, orders: 0 });
  const label = combined ? "Both businesses combined" : businesses[0].label;
  const value = metric === "orders" ? `${combinedTotal.orders.toLocaleString("en-US")} orders`
    : money(metric === "net sales" ? combinedTotal.revenueCents
      : metric === "estimated expenses" ? combinedTotal.expenseCents : combinedTotal.profitCents);
  const qualifier = metric === "estimated expenses" || metric === "net profit"
    ? " Expenses are the report's estimates." : "";
  const answer = sync?.lastSyncedAt
    ? `${label} ${metric} for ${period.label} ${metric === "orders" ? "were" : "was"} ${value}.${qualifier} Latest order sync: ${sync.lastSyncedAt.toISOString().slice(0, 10)}. [1]`
    : `I cannot verify ${label.toLowerCase()} ${metric} because no order sync is recorded. [1]`;
  return [{
    id: `record:report:profit-loss:${businesses.map((business) => business.key).join("+")}:${period.start}:${period.end}`,
    title: `Profit & Loss report: ${label}, ${period.label}`,
    kind: "record",
    url: `/finance/profit-loss?from=${period.start}&to=${period.end}&business=${businesses[0].key}`,
    excerpt: [
      `Report: Profit & Loss. Business: ${label}. Period: ${period.start} through ${period.end}.`,
      ...totals.map(({ business, total }) => `${business.label}: net sales ${money(total.revenueCents)}; ${total.orders} orders; estimated expenses ${money(total.expenseCents)}; net profit ${money(total.profitCents)}.`),
      "Net sales are completed or processing order subtotals less discounts, before tax and tips. Expenses accrue at the rate used by the Profit & Loss chart.",
      `Stored order sync: ${sync?.lastSyncedAt.toISOString() ?? "not recorded"}. This is not a live MoeGo query.`,
    ].join("\n"),
    updatedAt: sync?.updatedAt.toISOString() ?? new Date().toISOString(),
    dateKind: "entry",
    answer: requestedMetrics === 1 ? answer : undefined,
  }];
}
