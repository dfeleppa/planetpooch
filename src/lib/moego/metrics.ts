import { prisma } from "@/lib/prisma";

export type LeadSourceRow = {
  source: string;
  customers: number;
  /// Total paidAmount across all orders for customers attributed to this
  /// source — gross lifetime revenue, not per-customer.
  revenueCents: number;
  /// revenueCents / customers — average LTV for the cohort.
  avgLtvCents: number;
};

export type MoegoMetrics = {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  newCustomers: number;
  /// Sum of paidAmount across all orders whose customer was acquired in
  /// the window. This is the "cohort revenue" used for the windowed LTV.
  cohortRevenueCents: number;
  /// cohortRevenueCents / newCustomers. Zero customers → 0.
  avgLtvCents: number;
  /// All-time LTV across all customers, regardless of window. Useful as a
  /// "what's a customer worth to us" baseline alongside the windowed view.
  allTimeAvgLtvCents: number;
  totalCustomers: number;
  /// Meta ad spend for the same window, summed from MetaAdInsight.
  metaSpendCents: number;
  /// metaSpendCents / newCustomers. Blended CAC against Meta only —
  /// non-Meta sources (organic, referral) deflate this; that's expected.
  cacCents: number;
  leadSources: LeadSourceRow[];
  /// When the last successful sync of each resource finished. Null if
  /// that resource has never been synced.
  lastSync: {
    customer: string | null;
    order: string | null;
    lead: string | null;
  };
};

function startOfWindow(days: number): Date {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return since;
}

export async function getMoegoMetrics(days: number): Promise<MoegoMetrics> {
  const windowStart = startOfWindow(days);
  const windowEnd = new Date();

  // ---- customers acquired in window + their orders ----
  const newCustomers = await prisma.moegoCustomer.findMany({
    where: { createdTime: { gte: windowStart } },
    select: { moegoId: true, leadSource: true },
  });
  const newCustomerIds = newCustomers.map((c) => c.moegoId);

  let cohortRevenueCents = 0;
  if (newCustomerIds.length > 0) {
    const cohortRevenue = await prisma.moegoOrder.aggregate({
      where: { customerMoegoId: { in: newCustomerIds } },
      _sum: { paidCents: true },
    });
    cohortRevenueCents = cohortRevenue._sum.paidCents ?? 0;
  }

  // ---- all-time LTV baseline ----
  const [allTimeRevenue, totalCustomers] = await Promise.all([
    prisma.moegoOrder.aggregate({ _sum: { paidCents: true } }),
    prisma.moegoCustomer.count(),
  ]);
  const allTimeAvgLtvCents =
    totalCustomers > 0
      ? Math.round((allTimeRevenue._sum.paidCents ?? 0) / totalCustomers)
      : 0;

  // ---- Meta spend in window (sum cents from MetaAdInsight) ----
  const metaSpend = await prisma.metaAdInsight.aggregate({
    where: { date: { gte: windowStart } },
    _sum: { spendCents: true },
  });
  const metaSpendCents = metaSpend._sum.spendCents ?? 0;

  // ---- lead source breakdown for the window ----
  // groupBy on the cohort gives us the per-source customer count cheaply.
  const sourceGroups = await prisma.moegoCustomer.groupBy({
    by: ["leadSource"],
    where: { createdTime: { gte: windowStart } },
    _count: { _all: true },
  });

  // Revenue per source needs a per-source order roll-up. We get all orders
  // for the cohort once and bucket in memory — cheaper than N source-keyed
  // queries when source cardinality is high.
  const cohortOrders =
    newCustomerIds.length > 0
      ? await prisma.moegoOrder.findMany({
          where: { customerMoegoId: { in: newCustomerIds } },
          select: { customerMoegoId: true, paidCents: true },
        })
      : [];

  const sourceByCustomer = new Map<string, string | null>();
  for (const c of newCustomers) sourceByCustomer.set(c.moegoId, c.leadSource);

  const revenueBySource = new Map<string, number>();
  for (const o of cohortOrders) {
    if (!o.customerMoegoId) continue;
    const source =
      sourceByCustomer.get(o.customerMoegoId) ?? "(unattributed)";
    revenueBySource.set(source, (revenueBySource.get(source) ?? 0) + o.paidCents);
  }

  const leadSources: LeadSourceRow[] = sourceGroups
    .map((g) => {
      const source = g.leadSource ?? "(unattributed)";
      const customers = g._count._all;
      const revenueCents = revenueBySource.get(source) ?? 0;
      return {
        source,
        customers,
        revenueCents,
        avgLtvCents: customers > 0 ? Math.round(revenueCents / customers) : 0,
      };
    })
    .sort((a, b) => b.customers - a.customers);

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
    windowDays: days,
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd.toISOString(),
    newCustomers: newCustomers.length,
    cohortRevenueCents,
    avgLtvCents:
      newCustomers.length > 0
        ? Math.round(cohortRevenueCents / newCustomers.length)
        : 0,
    allTimeAvgLtvCents,
    totalCustomers,
    metaSpendCents,
    cacCents:
      newCustomers.length > 0
        ? Math.round(metaSpendCents / newCustomers.length)
        : 0,
    leadSources,
    lastSync,
  };
}
