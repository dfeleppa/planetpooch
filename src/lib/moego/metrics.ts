import { prisma } from "@/lib/prisma";

/**
 * Order statuses that represent real, collected money. CREATED orders are
 * unpaid drafts (paidCents ≈ 0) and REMOVED orders are voided — including
 * either in revenue/LTV inflates order and customer counts without adding
 * real money. Revenue math is scoped to these statuses everywhere.
 */
export const REVENUE_ORDER_STATUSES = ["COMPLETED", "PROCESSING"] as const;

export type LeadSourceRow = {
  source: string;
  customers: number;
  revenueCents: number;
  avgRevenueCents: number;
};

export type MoegoMetrics = {
  windowStart: string;
  windowEnd: string;
  revenueCents: number;
  orderCount: number;
  uniqueCustomers: number;
  newCustomers: number;
  totalCustomers: number;
  avgRevenuePerCustomerCents: number;
  allTimeAvgLtvCents: number;
  metaSpendCents: number;
  cacCents: number;
  leadSources: LeadSourceRow[];
  lastSync: {
    customer: string | null;
    order: string | null;
    lead: string | null;
  };
};

export async function getMoegoMetrics({
  from,
  to,
  businessId,
}: {
  from: Date;
  to: Date;
  businessId: string;
}): Promise<MoegoMetrics> {
  const windowStart = from;
  const windowEnd = to;

  // Revenue is attributed to *when the money landed* — salesDatetime,
  // falling back to completedTime, then the invoice's createdTime — not to
  // when the invoice was opened. Scoped to this business and to revenue-
  // bearing statuses so unpaid drafts and voided orders don't pad the window.
  const windowOrders = await prisma.$queryRaw<
    { customerMoegoId: string | null; paidCents: number }[]
  >`
    SELECT "customerMoegoId", "paidCents"
    FROM "MoegoOrder"
    WHERE "businessId" = ${businessId}
      AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
      AND COALESCE("salesDatetime", "completedTime", "createdTime") >= ${windowStart}
      AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${windowEnd}
  `;

  const revenueCents = windowOrders.reduce((s, o) => s + o.paidCents, 0);
  const orderCount = windowOrders.length;

  const uniqueCustomerIds = new Set(
    windowOrders.map((o) => o.customerMoegoId).filter(Boolean) as string[],
  );
  const uniqueCustomers = uniqueCustomerIds.size;

  const avgRevenuePerCustomerCents =
    uniqueCustomers > 0 ? Math.round(revenueCents / uniqueCustomers) : 0;

  // Customer counts are scoped "by where they transacted": a customer counts
  // for this business only if they have a revenue-bearing order here. New
  // customers = those acquired (createdTime) in the window who also
  // transacted at this business.
  const [
    newCustomerRows,
    allTimeRevenueRows,
    totalCustomerRows,
    newCustomerAccountCount,
    metaSpend,
  ] = await Promise.all([
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT c."moegoId")::int AS n
      FROM "MoegoCustomer" c
      JOIN "MoegoOrder" o ON o."customerMoegoId" = c."moegoId"
      WHERE c."createdTime" >= ${windowStart} AND c."createdTime" < ${windowEnd}
        AND o."businessId" = ${businessId}
        AND o."status" = ANY(${[...REVENUE_ORDER_STATUSES]})
    `,
    prisma.$queryRaw<{ sum: bigint }[]>`
      SELECT COALESCE(SUM("paidCents"), 0)::bigint AS sum
      FROM "MoegoOrder"
      WHERE "businessId" = ${businessId}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
    `,
    prisma.$queryRaw<{ n: number }[]>`
      SELECT COUNT(DISTINCT "customerMoegoId")::int AS n
      FROM "MoegoOrder"
      WHERE "businessId" = ${businessId} AND "customerMoegoId" IS NOT NULL
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
    `,
    // Account-wide new customers — only used for the account-wide CAC tile,
    // since Meta spend (MetaAdInsight) isn't attributable to a business.
    prisma.moegoCustomer.count({
      where: { createdTime: { gte: windowStart, lt: windowEnd } },
    }),
    prisma.metaAdInsight.aggregate({
      where: {
        date: {
          gte: new Date(windowStart.toISOString().slice(0, 10)),
          lt: new Date(windowEnd.toISOString().slice(0, 10)),
        },
      },
      _sum: { spendCents: true },
    }),
  ]);

  const newCustomerCount = newCustomerRows[0]?.n ?? 0;
  const totalCustomers = totalCustomerRows[0]?.n ?? 0;
  const allTimeRevenueCents = Number(allTimeRevenueRows[0]?.sum ?? 0);

  const allTimeAvgLtvCents =
    totalCustomers > 0 ? Math.round(allTimeRevenueCents / totalCustomers) : 0;
  const metaSpendCents = metaSpend._sum.spendCents ?? 0;

  // ---- lead source breakdown based on orders in window ----
  const customerIds = [...uniqueCustomerIds];
  const customers =
    customerIds.length > 0
      ? await prisma.moegoCustomer.findMany({
          where: { moegoId: { in: customerIds } },
          select: { moegoId: true, leadSource: true },
        })
      : [];

  const sourceByCustomer = new Map<string, string>();
  for (const c of customers)
    sourceByCustomer.set(c.moegoId, c.leadSource ?? "(unattributed)");

  const sourceAgg = new Map<string, { customers: Set<string>; revenue: number }>();
  for (const o of windowOrders) {
    const source = o.customerMoegoId
      ? sourceByCustomer.get(o.customerMoegoId) ?? "(unattributed)"
      : "(unattributed)";
    let entry = sourceAgg.get(source);
    if (!entry) {
      entry = { customers: new Set(), revenue: 0 };
      sourceAgg.set(source, entry);
    }
    if (o.customerMoegoId) entry.customers.add(o.customerMoegoId);
    entry.revenue += o.paidCents;
  }

  const leadSources: LeadSourceRow[] = [...sourceAgg.entries()]
    .map(([source, { customers: custs, revenue }]) => ({
      source,
      customers: custs.size,
      revenueCents: revenue,
      avgRevenueCents: custs.size > 0 ? Math.round(revenue / custs.size) : 0,
    }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  // ---- sync watermarks ----
  const syncRows = await prisma.moegoSyncState.findMany();
  const lastSync = {
    customer:
      syncRows.find((r) => r.resource === "customer")?.lastSyncedAt.toISOString() ??
      null,
    order:
      syncRows.find((r) => r.resource === "order")?.lastSyncedAt.toISOString() ??
      null,
    lead:
      syncRows.find((r) => r.resource === "lead")?.lastSyncedAt.toISOString() ??
      null,
  };

  return {
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    revenueCents,
    orderCount,
    uniqueCustomers,
    newCustomers: newCustomerCount,
    totalCustomers,
    avgRevenuePerCustomerCents,
    allTimeAvgLtvCents,
    metaSpendCents,
    cacCents:
      newCustomerAccountCount > 0
        ? Math.round(metaSpendCents / newCustomerAccountCount)
        : 0,
    leadSources,
    lastSync,
  };
}
