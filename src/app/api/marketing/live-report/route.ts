import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMetaPeriodMetrics } from "@/lib/marketing/meta-reporting";
import { leadRevenueBySource } from "@/lib/marketing/lead-revenue-report";
import type { LeadAttributionSource } from "@/lib/marketing/lead-attribution";
import { leadOutcomeWindow } from "@/lib/marketing/lead-outcomes";

const DAY_MS = 86_400_000;

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
  const sourceParam = req.nextUrl.searchParams.get("source");
  const source: LeadAttributionSource | "all" = sourceParam === "meta" || sourceParam === "google-ads" || sourceParam === "google-lsa"
    ? sourceParam : "all";

  const [meta, orderCursor, latestOrder, google, lsa, manualSpend] = await Promise.all([
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
    prisma.marketingManualSpend.findMany({
      where: { business: "combined", periodStart: from, periodEnd: to },
      select: { source: true, amountCents: true, updatedAt: true },
    }),
  ]);
  const manualGoogle = manualSpend.find((item) => item.source === "google-ads");
  const manualLsa = manualSpend.find((item) => item.source === "google-lsa");

  const { staleBefore } = leadOutcomeWindow(1);
  const orderDataAvailable = Boolean(orderCursor && latestOrder._max.syncedAt && latestOrder._max.syncedAt >= staleBefore);
  let revenue: Awaited<ReturnType<typeof leadRevenueBySource>> | null = null;
  if (orderDataAvailable) {
    revenue = await leadRevenueBySource(["RESORT", "GROOMING"], req.nextUrl.searchParams.get("from")!, req.nextUrl.searchParams.get("to")!, source);
  }

  return NextResponse.json({
    metric: {
      metaAdSpend: meta.spendCents,
      googleAdSpend: manualGoogle?.amountCents ?? (google._count._all ? google._sum.costCents : null),
      googleLsaAdSpend: manualLsa?.amountCents ?? (lsa._count._all ? lsa._sum.totalPaidCents : null),
      googleSpendOrigin: manualGoogle ? "manual" : google._count._all ? "csv" : null,
      googleLsaSpendOrigin: manualLsa ? "manual" : lsa._count._all ? "csv" : null,
      metaRevenue: revenue?.totals.meta ?? null,
      googleRevenue: revenue?.totals["google-ads"] ?? null,
      googleLsaRevenue: revenue?.totals["google-lsa"] ?? null,
      unattributedRevenue: revenue?.totals.unattributed ?? null,
      totalMoegoRevenue: revenue ? Object.values(revenue.totals).reduce((sum, value) => sum + value, 0) : null,
      leadsLimited: revenue?.limited ?? false,
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
