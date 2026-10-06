import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { getMetaPeriodMetrics } from "@/lib/marketing/meta-reporting";
import { allocatePaidOrders } from "@/lib/marketing/live-report";
import { MOBILE_GROOMING_BUSINESS_ID, PET_RESORT_BUSINESS_ID } from "@/lib/moego/businesses";

const DAY_MS = 86_400_000;
const FRESH_MS = 48 * 60 * 60 * 1000;
const PAID_STATUSES = ["PROCESSING", "COMPLETED"];

function parseDay(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const from = parseDay(req.nextUrl.searchParams.get("from"));
  const to = parseDay(req.nextUrl.searchParams.get("to"));
  if (!from || !to || from > to) {
    return NextResponse.json({ error: "Valid from and to dates are required." }, { status: 400 });
  }
  const toExclusive = new Date(to.getTime() + DAY_MS);
  const business = await getActiveBusiness();
  const businessId = business.key === "pet-resort" ? PET_RESORT_BUSINESS_ID : MOBILE_GROOMING_BUSINESS_ID;

  const [meta, orderCursor, latestOrder, google, lsa, orders] = await Promise.all([
    getMetaPeriodMetrics(business.key, from, toExclusive),
    prisma.moegoSyncState.findUnique({ where: { resource: "order" }, select: { lastSyncedAt: true } }),
    prisma.moegoOrder.aggregate({ _max: { syncedAt: true } }),
    prisma.financeGoogleCampaignReportRow.aggregate({
      where: { business: business.key, periodStart: from, periodEnd: to },
      _sum: { costCents: true }, _count: { _all: true }, _max: { updatedAt: true },
    }),
    prisma.financeGoogleLsaLeadReportRow.aggregate({
      where: { business: business.key, periodStart: from, periodEnd: to },
      _sum: { totalPaidCents: true }, _count: { _all: true }, _max: { updatedAt: true },
    }),
    prisma.moegoOrder.findMany({
      where: {
        businessId,
        status: { in: PAID_STATUSES },
        OR: [
          { salesDatetime: { gte: from, lt: toExclusive } },
          { salesDatetime: null, completedTime: { gte: from, lt: toExclusive } },
          { salesDatetime: null, completedTime: null, createdTime: { gte: from, lt: toExclusive } },
        ],
      },
      select: { customerMoegoId: true, createdTime: true, salesDatetime: true, completedTime: true, paidCents: true, refundedCents: true },
    }),
  ]);

  // A MoeGo cursor can advance even when the orders endpoint lacks permission.
  // Require recently updated order rows as independent evidence of a working sync.
  const freshBefore = Date.now() - FRESH_MS;
  const orderDataAvailable = Boolean(orderCursor?.lastSyncedAt && latestOrder._max.syncedAt &&
    orderCursor.lastSyncedAt.getTime() >= freshBefore && latestOrder._max.syncedAt.getTime() >= freshBefore);
  let revenue: ReturnType<typeof allocatePaidOrders> | null = null;
  if (orderDataAvailable) {
    const customerIds = [...new Set(orders.flatMap((order) => order.customerMoegoId ? [order.customerMoegoId] : []))];
    const submissions = customerIds.length ? await prisma.websiteFormSubmission.findMany({
      where: {
        company: business.company,
        status: "SYNCED",
        moegoCustomerId: { in: customerIds },
        receivedAt: { lt: toExclusive },
      },
      select: { moegoCustomerId: true, receivedAt: true, attribution: true },
    }) : [];
    revenue = allocatePaidOrders(orders, submissions);
  }

  return NextResponse.json({
    metric: {
      metaAdSpend: meta.spendCents,
      googleAdSpend: google._count._all ? google._sum.costCents : null,
      googleLsaAdSpend: lsa._count._all ? lsa._sum.totalPaidCents : null,
      metaRevenue: revenue?.meta ?? null,
      googleRevenue: revenue?.["google-ads"] ?? null,
      googleLsaRevenue: revenue?.["google-lsa"] ?? null,
      unattributedRevenue: revenue?.unattributed ?? null,
      totalMoegoRevenue: revenue ? Object.values(revenue).reduce((sum, value) => sum + value, 0) : null,
      metaDataThrough: meta.through,
      metaDataComplete: meta.complete,
      metaSyncedAt: meta.syncedAt,
      moegoSyncedAt: latestOrder._max.syncedAt,
      moegoCursorThrough: orderCursor?.lastSyncedAt ?? null,
      moegoDataAvailable: orderDataAvailable,
      googleImportedAt: google._max.updatedAt,
      googleLsaImportedAt: lsa._max.updatedAt,
    },
  });
}
