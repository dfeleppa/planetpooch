import { prisma } from "@/lib/prisma";
import { BUSINESSES } from "@/lib/business";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import type { KnowledgeSource } from "@/lib/knowledge";

export function quarterRevenueRange(question: string, now = new Date()) {
  if (!/\b(?:revenue|net sales|total sales)\b/i.test(question)) return null;
  const quarter = question.match(/\b(?:q\s*([1-4])|quarter\s*([1-4])|(?:first|second|third|fourth)\s+quarter)\b/i);
  if (!quarter) return null;
  const ordinal = quarter[0].toLowerCase().match(/first|second|third|fourth/)?.[0];
  const number = Number(quarter[1] ?? quarter[2] ?? ({ first: 1, second: 2, third: 3, fourth: 4 } as Record<string, number>)[ordinal ?? ""]);
  const today = formatEasternDate(now);
  const mentionedYear = question.match(/\b20\d{2}\b/)?.[0];
  const year = mentionedYear ? Number(mentionedYear) : Number(today.slice(0, 4)) - (/\blast year\b/i.test(question) ? 1 : 0);
  const start = `${year}-${String((number - 1) * 3 + 1).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(year, number * 3, 0)).toISOString().slice(0, 10);
  if (start > today) return null;
  return { quarter: number, year, start, end: end < today ? end : today, quarterEnd: end };
}

export async function findQuarterRevenueSource(question: string): Promise<KnowledgeSource[]> {
  const range = quarterRevenueRange(question);
  if (!range) return [];
  // Match the Profit & Loss report's UTC date bounds, statuses, and net-sales formula.
  const from = new Date(`${range.start}T00:00:00.000Z`);
  const to = new Date(new Date(`${range.end}T00:00:00.000Z`).getTime() + 86_400_000);
  const [rows, sync] = await Promise.all([
    prisma.$queryRaw<Array<{ businessId: string | null; revenueCents: bigint }>>`
      SELECT "businessId",
        COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "revenueCents"
      FROM "MoegoOrder"
      WHERE COALESCE("salesDatetime", "completedTime", "createdTime") >= ${from}
        AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${to}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
      GROUP BY "businessId"
    `,
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
  ]);
  const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const amounts = BUSINESSES.map((business) => ({
    label: business.label,
    cents: Number(rows.find((row) => row.businessId === business.moegoId)?.revenueCents ?? 0),
  }));
  const total = amounts.reduce((sum, amount) => sum + amount.cents, 0);
  const partial = range.end < range.quarterEnd;
  return [{
    id: `record:profit-loss:q${range.quarter}-${range.year}:${range.end}`,
    title: `Profit & Loss net sales: Q${range.quarter} ${range.year}${partial ? " to date" : ""}`,
    kind: "record",
    url: `/finance/profit-loss?from=${range.start}&to=${range.end}`,
    excerpt: [
      `Reporting period: ${range.start} through ${range.end} (Q${range.quarter} ${range.year}${partial ? ` to date; quarter ends ${range.quarterEnd}` : ""}).`,
      ...amounts.map((amount) => `${amount.label} net sales: ${money(amount.cents)}.`),
      `Combined net sales across both businesses: ${money(total)}. The Profit & Loss page shows one business at a time; this combined figure is the sum of both report values.`,
      "Net sales means order subtotal less discounts, before tax and tips. It is different from paid amount. Included statuses: COMPLETED and PROCESSING.",
      `Latest order sync: ${sync?.lastSyncedAt.toISOString() ?? "not recorded"}. Stored app data, not a live MoeGo query.`,
    ].join("\n"),
    updatedAt: sync?.updatedAt.toISOString() ?? new Date().toISOString(),
    dateKind: "entry",
  }];
}
