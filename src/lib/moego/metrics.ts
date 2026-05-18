import { prisma } from "@/lib/prisma";

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
}: {
  from: Date;
  to: Date;
}): Promise<MoegoMetrics> {
  const windowStart = from;
  const windowEnd = to;

  const windowOrders = await prisma.moegoOrder.findMany({
    where: { createdTime: { gte: windowStart, lt: windowEnd } },
    select: { customerMoegoId: true, paidCents: true },
  });

  const revenueCents = windowOrders.reduce((s, o) => s + o.paidCents, 0);
  const orderCount = windowOrders.length;

  const uniqueCustomerIds = new Set(
    windowOrders.map((o) => o.customerMoegoId).filter(Boolean) as string[],
  );
  const uniqueCustomers = uniqueCustomerIds.size;

  const avgRevenuePerCustomerCents =
    uniqueCustomers > 0 ? Math.round(revenueCents / uniqueCustomers) : 0;

  const [newCustomerCount, allTimeRevenue, totalCustomers, metaSpend] =
    await Promise.all([
      prisma.moegoCustomer.count({
        where: { createdTime: { gte: windowStart, lt: windowEnd } },
      }),
      prisma.moegoOrder.aggregate({ _sum: { paidCents: true } }),
      prisma.moegoCustomer.count(),
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

  const allTimeAvgLtvCents =
    totalCustomers > 0
      ? Math.round((allTimeRevenue._sum.paidCents ?? 0) / totalCustomers)
      : 0;
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
      newCustomerCount > 0 ? Math.round(metaSpendCents / newCustomerCount) : 0,
    leadSources,
    lastSync,
  };
}
