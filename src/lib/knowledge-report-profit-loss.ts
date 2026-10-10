import { BUSINESSES } from "@/lib/business";
import { getActiveBusiness } from "@/lib/business-server";
import type { KnowledgeSource } from "@/lib/knowledge";
import { findQuarterRevenueSource, quarterRevenueRange } from "@/lib/knowledge-finance";
import { completedReportWeeks, defaultProfitPeriod, reportPeriod } from "@/lib/knowledge-report-period";
import { getProfitLossTotals } from "@/lib/moego/profit-loss-totals";
import { prisma } from "@/lib/prisma";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";

type ProfitMetric = "net sales" | "orders" | "estimated expenses" | "net profit";

export function profitMetric(question: string): ProfitMetric | null {
  if (/\b(?:net profit|profit(?:able|ability)?|margin|earnings)\b/i.test(question)) return "net profit";
  if (/\b(?:estimated expenses?|expenses?|operating costs?|costs?)\b/i.test(question)) return "estimated expenses";
  if (/\b(?:order count|number of orders|how many orders)\b/i.test(question)) return "orders";
  if (/\b(?:net sales|revenue|total sales|income)\b/i.test(question)) return "net sales";
  return null;
}

const money = (cents: number) => (cents / 100).toLocaleString("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2,
});

export function isWeeklyProfitComparison(question: string): boolean {
  return (/\b(?:last|most recent) (?:completed )?week\b/i.test(question)
      || /\b(?:week[\s-]*(?:ending|ended|end)|w\/e)\s*(?:on\s+)?\d{1,2}\/\d{1,2}/i.test(question))
    && /\b(?:profit|earnings|net sales|revenue|total sales|expenses?|orders?)\b/i.test(question)
    && /\b(?:chang\w*|compar\w*|versus|vs\.?|prior|previous|trend)\b/i.test(question);
}

export function profitMarginPercent(profitCents: number, revenueCents: number): number | null {
  return revenueCents > 0 ? profitCents / revenueCents * 100 : null;
}

async function weeklyProfitComparison(question: string): Promise<KnowledgeSource[]> {
  const current = /\b(?:last|most recent) (?:completed )?week\b/i.test(question)
    ? completedReportWeeks(1)[0] : reportPeriod(question)!;
  if (current.end >= formatEasternDate(new Date())) return [{
    id: `record:report:profit-loss:comparison:incomplete:${current.start}`,
    title: `Profit & Loss comparison: ${current.label}`,
    kind: "record", url: "/finance/profit-loss",
    excerpt: `${current.label} is not complete yet, so I cannot compare its full net profit with the prior week.`,
    answer: `${current.label} is not complete yet, so I cannot compare its full net profit with the prior week. [1]`,
    updatedAt: new Date().toISOString(), dateKind: "entry",
  }];
  const previousStart = new Date(`${current.start}T00:00:00.000Z`);
  previousStart.setUTCDate(previousStart.getUTCDate() - 7);
  const previousEnd = new Date(`${current.end}T00:00:00.000Z`);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 7);
  const previous = {
    start: previousStart.toISOString().slice(0, 10), end: previousEnd.toISOString().slice(0, 10),
    label: `week ending ${previousEnd.toISOString().slice(0, 10)}`, kind: "week" as const,
  };
  const active = await getActiveBusiness();
  const explicit = /\bmobile[ -]?grooming\b/i.test(question) ? BUSINESSES[1]
    : /\bpet[ -]?resort\b/i.test(question) ? BUSINESSES[0] : null;
  const combined = /\b(?:both businesses|all businesses|combined|company[ -]?wide)\b/i.test(question);
  const businesses = combined ? [...BUSINESSES] : [explicit ?? active];
  const bounds = (period: typeof current) => ({
    from: new Date(`${period.start}T00:00:00.000Z`),
    to: new Date(new Date(`${period.end}T00:00:00.000Z`).getTime() + 86_400_000),
  });
  const [currentRows, previousRows, sync] = await Promise.all([
    Promise.all(businesses.map((business) => {
      const { from, to } = bounds(current);
      return getProfitLossTotals(business.moegoId, from, to);
    })),
    Promise.all(businesses.map((business) => {
      const { from, to } = bounds(previous);
      return getProfitLossTotals(business.moegoId, from, to);
    })),
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
  ]);
  const sum = (rows: typeof currentRows) => rows.reduce((total, row) => ({
    revenueCents: total.revenueCents + row.revenueCents,
    expenseCents: total.expenseCents + row.expenseCents,
    profitCents: total.profitCents + row.profitCents,
    orders: total.orders + row.orders,
  }), { revenueCents: 0, expenseCents: 0, profitCents: 0, orders: 0 });
  const latest = sum(currentRows);
  const prior = sum(previousRows);
  const label = combined ? "Both businesses combined" : businesses[0].label;
  const change = latest.profitCents - prior.profitCents;
  const salesChange = latest.revenueCents - prior.revenueCents;
  const expenseChange = latest.expenseCents - prior.expenseCents;
  const salesPercent = prior.revenueCents === 0 ? null : salesChange / Math.abs(prior.revenueCents) * 100;
  const salesComparison = `Net sales: ${money(prior.revenueCents)} for ${previous.start}–${previous.end}, ${money(latest.revenueCents)} for ${current.start}–${current.end}; change ${money(salesChange)} (${salesPercent === null ? "percentage change undefined because prior sales were zero" : `${salesPercent.toFixed(1)}%`}).`;
  const direction = change > 0 ? "increased" : change < 0 ? "decreased" : "was unchanged";
  const marginRequested = /\bmargin\b/i.test(question);
  const latestMargin = profitMarginPercent(latest.profitCents, latest.revenueCents);
  const priorMargin = profitMarginPercent(prior.profitCents, prior.revenueCents);
  const marginAnswer = latestMargin === null || priorMargin === null
    ? `I cannot compare net profit margins because net sales were zero in at least one week. [1]`
    : `${label} net profit margin was ${latestMargin.toFixed(1)}% for ${current.start}–${current.end}, versus ${priorMargin.toFixed(1)}% for ${previous.start}–${previous.end}; it ${latestMargin < priorMargin ? "fell" : latestMargin > priorMargin ? "rose" : "was unchanged"} by ${Math.abs(latestMargin - priorMargin).toFixed(1)} percentage points. Net profit was ${money(latest.profitCents)} on ${money(latest.revenueCents)} net sales, versus ${money(prior.profitCents)} on ${money(prior.revenueCents)} net sales. Expenses in the Profit & Loss report are estimates. Latest order sync: ${sync?.lastSyncedAt?.toISOString().slice(0, 10)}. [1]`;
  const answer = sync?.lastSyncedAt && formatEasternDate(sync.lastSyncedAt) >= current.end
    ? marginRequested ? marginAnswer : `${label} net profit ${direction} by ${money(Math.abs(change))}: ${money(prior.profitCents)} for ${previous.start}–${previous.end} versus ${money(latest.profitCents)} for ${current.start}–${current.end}. `
      + `Net sales changed by ${money(salesChange)} (${money(prior.revenueCents)} to ${money(latest.revenueCents)}); estimated expenses changed by ${money(expenseChange)}. `
      + `Order count changed from ${prior.orders} to ${latest.orders}. This explains the arithmetic change in the Profit & Loss report; the available totals do not establish why customer demand or costs changed. `
      + `Latest order sync: ${sync.lastSyncedAt.toISOString().slice(0, 10)}. [1]`
    : `I cannot verify the weekly net profit comparison because the recorded order sync does not cover the latest completed week. [1]`;
  return [{
    id: `record:report:profit-loss:comparison:${businesses.map((business) => business.key).join("+")}:${current.start}`,
    title: `Profit & Loss comparison: ${label}, ${previous.label} vs ${current.label}`,
    kind: "record", url: `/finance/profit-loss?from=${current.start}&to=${current.end}&business=${businesses[0].key}`,
    excerpt: sync?.lastSyncedAt && formatEasternDate(sync.lastSyncedAt) >= current.end
      ? `${answer}\n${salesComparison}\nEstimated expenses: ${money(prior.expenseCents)} to ${money(latest.expenseCents)}. These totals cannot identify service mix or the causes of demand changes.` : answer,
    answer: profitMetric(question) === "net sales" && sync?.lastSyncedAt && formatEasternDate(sync.lastSyncedAt) >= current.end
      ? `${salesComparison} Latest order sync: ${sync.lastSyncedAt.toISOString().slice(0, 10)}. [1]` : answer,
    updatedAt: sync?.updatedAt.toISOString() ?? new Date().toISOString(), dateKind: "entry",
  }];
}

export async function findProfitLossReport(question: string): Promise<KnowledgeSource[]> {
  const metric = profitMetric(question);
  if (!metric) return [];
  if (isWeeklyProfitComparison(question)) return weeklyProfitComparison(question);
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
      ...(sync?.lastSyncedAt ? totals.map(({ business, total }) => `${business.label}: net sales ${money(total.revenueCents)}; ${total.orders} orders; estimated expenses ${money(total.expenseCents)}; net profit ${money(total.profitCents)}.`)
        : ["No recorded order sync: sales, order count, profit and margin cannot be verified. Do not interpret missing synchronization as zero sales."]),
      "Net sales are completed or processing order subtotals less discounts, before tax and tips. Expenses accrue at the rate used by the Profit & Loss chart.",
      "Expenses are a fixed planning estimate, not itemized actual labor and other costs. Net profit and margin derived from these expenses are estimates, not verified accounting profit. Actual labor and other expenses cannot be inferred from this total.",
      `Stored order sync: ${sync?.lastSyncedAt.toISOString() ?? "not recorded"}. This is not a live MoeGo query.`,
      ...(period.end >= formatEasternDate(new Date()) ? ["This period includes today and may be incomplete. Do not divide its sales by all calendar days to project a full-day pace; a completed-day cutoff is needed."] : []),
    ].join("\n"),
    updatedAt: sync?.updatedAt.toISOString() ?? new Date().toISOString(),
    dateKind: "entry",
    answer: requestedMetrics === 1 ? answer : undefined,
  }];
}
