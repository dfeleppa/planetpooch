import { prisma } from "@/lib/prisma";
import { BUSINESSES } from "@/lib/business";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { getActiveBusiness } from "@/lib/business-server";
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

export function completedWeeksWithin(start: string, end: string) {
  const first = new Date(`${start}T00:00:00.000Z`);
  first.setUTCDate(first.getUTCDate() + (7 - first.getUTCDay()) % 7);
  const last = new Date(`${end}T00:00:00.000Z`);
  last.setUTCDate(last.getUTCDate() - (last.getUTCDay() + 1) % 7);
  return first <= last
    ? { start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10) }
    : null;
}

export async function findQuarterRevenueSource(question: string): Promise<KnowledgeSource[]> {
  const range = quarterRevenueRange(question);
  if (!range) return [];
  // Match the Profit & Loss report's UTC date bounds, statuses, and net-sales formula.
  const from = new Date(`${range.start}T00:00:00.000Z`);
  const to = new Date(new Date(`${range.end}T00:00:00.000Z`).getTime() + 86_400_000);
  const fullWeeks = completedWeeksWithin(range.start, range.end);
  const weekFrom = fullWeeks ? new Date(`${fullWeeks.start}T00:00:00.000Z`) : null;
  const weekTo = fullWeeks ? new Date(new Date(`${fullWeeks.end}T00:00:00.000Z`).getTime() + 86_400_000) : null;
  const [rows, sync, activeBusiness] = await Promise.all([
    prisma.$queryRaw<Array<{ businessId: string | null; revenueCents: bigint; completeWeekCents: bigint }>>`
      SELECT "businessId",
        COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "revenueCents",
        COALESCE(SUM(CASE WHEN ${weekFrom}::timestamptz IS NOT NULL
          AND COALESCE("salesDatetime", "completedTime", "createdTime") >= ${weekFrom}::timestamptz
          AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${weekTo}::timestamptz
          THEN "subTotalCents" - "discountCents" ELSE 0 END), 0)::bigint AS "completeWeekCents"
      FROM "MoegoOrder"
      WHERE COALESCE("salesDatetime", "completedTime", "createdTime") >= ${from}
        AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${to}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
      GROUP BY "businessId"
    `,
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
    getActiveBusiness(),
  ]);
  const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const amounts = [...BUSINESSES].sort((a, b) => Number(b.moegoId === activeBusiness.moegoId) - Number(a.moegoId === activeBusiness.moegoId)).map((business) => ({
    label: business.label,
    cents: Number(rows.find((row) => row.businessId === business.moegoId)?.revenueCents ?? 0),
    completeWeekCents: Number(rows.find((row) => row.businessId === business.moegoId)?.completeWeekCents ?? 0),
  }));
  const total = amounts.reduce((sum, amount) => sum + amount.cents, 0);
  const completeWeeksTotal = amounts.reduce((sum, amount) => sum + amount.completeWeekCents, 0);
  const partial = range.end < range.quarterEnd;
  return [{
    id: `record:profit-loss:q${range.quarter}-${range.year}:${range.end}`,
    title: `${activeBusiness.label} Profit & Loss net sales: Q${range.quarter} ${range.year}${partial ? " to date" : ""}`,
    kind: "record",
    url: `/finance/profit-loss?from=${fullWeeks?.start ?? range.start}&to=${fullWeeks?.end ?? range.end}`,
    excerpt: [
      `Reporting period: ${range.start} through ${range.end} (Q${range.quarter} ${range.year}${partial ? ` to date; quarter ends ${range.quarterEnd}` : ""}).`,
      `Currently selected app business: ${activeBusiness.label}.`,
      fullWeeks ? `Completed Sunday-Saturday reporting weeks fully inside Q${range.quarter}: ${fullWeeks.start} through ${fullWeeks.end}. The linked Profit & Loss report opens to this completed-week range.` : "No completed reporting week is fully inside this period yet.",
      ...amounts.map((amount) => `${amount.label}: completed-week net sales ${money(amount.completeWeekCents)}; calendar Q${range.quarter} net sales through ${range.end} ${money(amount.cents)}.`),
      `Combined businesses: completed-week net sales ${money(completeWeeksTotal)}; calendar Q${range.quarter} net sales through ${range.end} ${money(total)}. The Profit & Loss page shows one business at a time.`,
      "Net sales means order subtotal less discounts, before tax and tips. It is different from paid amount. Included statuses: COMPLETED and PROCESSING.",
      `Latest order sync: ${sync?.lastSyncedAt.toISOString() ?? "not recorded"}. Stored app data, not a live MoeGo query.`,
    ].join("\n"),
    updatedAt: sync?.updatedAt.toISOString() ?? new Date().toISOString(),
    dateKind: "entry",
  }];
}
