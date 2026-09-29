import { prisma } from "@/lib/prisma";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { CHART_WEEKLY_EXPENSE_CENTS } from "@/lib/moego/chart-profit";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function estimatedExpenseCents(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / WEEK_MS * CHART_WEEKLY_EXPENSE_CENTS);
}

/** Same order and expense definitions used by the Profit & Loss chart. `to` is exclusive. */
export async function getProfitLossTotals(businessId: string, from: Date, to: Date) {
  const rows = await prisma.$queryRaw<Array<{ revenueCents: bigint; orders: bigint }>>`
    SELECT COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "revenueCents",
      COUNT(*)::bigint AS orders
    FROM "MoegoOrder"
    WHERE COALESCE("salesDatetime", "completedTime", "createdTime") >= ${from}
      AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${to}
      AND "businessId" = ${businessId}
      AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
  `;
  const revenueCents = Number(rows[0]?.revenueCents ?? 0);
  const expenseCents = estimatedExpenseCents(from, to);
  return { revenueCents, expenseCents, profitCents: revenueCents - expenseCents,
    orders: Number(rows[0]?.orders ?? 0) };
}
