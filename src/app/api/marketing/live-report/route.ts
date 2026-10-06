import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMetaPeriodMetrics } from "@/lib/marketing/meta-reporting";
import { allocatePaidOrders, expandVerifiedSubmissionProfiles } from "@/lib/marketing/live-report";
import { normalizedPhone } from "@/lib/marketing/moego-client-history";
import type { OutcomeCustomerProfile } from "@/lib/marketing/lead-outcomes";
import { MOBILE_GROOMING_BUSINESS_ID, PET_RESORT_BUSINESS_ID } from "@/lib/moego/businesses";
import { Prisma } from "@prisma/client";

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
  const businessIds = [PET_RESORT_BUSINESS_ID, MOBILE_GROOMING_BUSINESS_ID];

  const [meta, orderCursor, latestOrder, google, lsa, orders] = await Promise.all([
    getMetaPeriodMetrics("", from, toExclusive),
    prisma.moegoSyncState.findUnique({ where: { resource: "order" }, select: { lastSyncedAt: true } }),
    prisma.moegoOrder.aggregate({ _max: { syncedAt: true } }),
    prisma.financeGoogleCampaignReportRow.aggregate({
      where: { business: { in: ["pet-resort", "mobile-grooming"] }, periodStart: from, periodEnd: to },
      _sum: { costCents: true }, _count: { _all: true }, _max: { updatedAt: true },
    }),
    prisma.financeGoogleLsaLeadReportRow.aggregate({
      where: { business: { in: ["pet-resort", "mobile-grooming"] }, periodStart: from, periodEnd: to },
      _sum: { totalPaidCents: true }, _count: { _all: true }, _max: { updatedAt: true },
    }),
    prisma.moegoOrder.findMany({
      where: {
        businessId: { in: businessIds },
        status: { in: PAID_STATUSES },
        OR: [
          { salesDatetime: { gte: from, lt: toExclusive } },
          { salesDatetime: null, completedTime: { gte: from, lt: toExclusive } },
          { salesDatetime: null, completedTime: null, createdTime: { gte: from, lt: toExclusive } },
        ],
      },
      select: { businessId: true, customerMoegoId: true, createdTime: true, salesDatetime: true, completedTime: true, paidCents: true, refundedCents: true },
    }),
  ]);

  // A MoeGo cursor can advance even when the orders endpoint lacks permission.
  // Require recently updated order rows as independent evidence of a working sync.
  const freshBefore = Date.now() - FRESH_MS;
  const orderDataAvailable = Boolean(orderCursor?.lastSyncedAt && latestOrder._max.syncedAt &&
    orderCursor.lastSyncedAt.getTime() >= freshBefore && latestOrder._max.syncedAt.getTime() >= freshBefore);
  let revenue: ReturnType<typeof allocatePaidOrders> | null = null;
  if (orderDataAvailable) {
    const orderCustomerIds = new Set(orders.flatMap((order) => order.customerMoegoId ? [order.customerMoegoId] : []));
    const submissions = orderCustomerIds.size ? await prisma.websiteFormSubmission.findMany({
      where: {
        company: { in: ["RESORT", "GROOMING"] },
        status: "SYNCED",
        moegoCustomerId: { not: null },
        receivedAt: { lt: toExclusive },
      },
      select: { moegoCustomerId: true, receivedAt: true, attribution: true,
        firstName: true, lastName: true, phone: true, email: true },
    }) : [];
    const phones = [...new Set(submissions.map((submission) => normalizedPhone(submission.phone))
      .filter((phone): phone is string => phone !== null))];
    const profiles = phones.length ? await prisma.$queryRaw<OutcomeCustomerProfile[]>(Prisma.sql`
      SELECT "moegoId", "name", "email", "mainPhoneNumber"
      FROM "MoegoCustomer"
      WHERE RIGHT(REGEXP_REPLACE(COALESCE("mainPhoneNumber", ''), '[^0-9]', '', 'g'), 10)
        IN (${Prisma.join(phones)})
    `) : [];
    revenue = allocatePaidOrders(orders, expandVerifiedSubmissionProfiles(submissions, profiles, orderCustomerIds));
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
