import { prisma } from "@/lib/prisma";
import { coversMetaPeriod } from "./meta-coverage";

export async function metaInsightWhere(business: string, from: Date, toExclusive: Date) {
  const company = business === "pet-resort" ? "RESORT" : business === "mobile-grooming" ? "GROOMING" : null;
  const assignments = company
    ? await prisma.metaCampaignBusiness.findMany({ where: { companies: { has: company } }, select: { campaignId: true } })
    : null;
  return {
    date: { gte: from, lt: toExclusive },
    ...(assignments ? { campaignId: { in: assignments.map((row) => row.campaignId) } } : {}),
  };
}

export async function getMetaPeriodMetrics(business: string, from: Date, toExclusive: Date) {
  const where = await metaInsightWhere(business, from, toExclusive);
  const [totals, windows] = await Promise.all([
    prisma.metaAdInsight.aggregate({ where, _sum: { spendCents: true, purchaseValueCents: true }, _count: { _all: true } }),
    prisma.metaInsightSyncWindow.findMany({
      where: { since: { lt: toExclusive }, until: { gte: from } },
      orderBy: { since: "asc" },
      select: { since: true, until: true, syncedAt: true },
    }),
  ]);
  const latestWindow = windows.reduce<Date | null>((latest, window) =>
    !latest || window.until > latest ? window.until : latest, null);
  const latestSync = windows.reduce<Date | null>((latest, window) =>
    !latest || window.syncedAt > latest ? window.syncedAt : latest, null);
  const through = latestWindow?.toISOString().slice(0, 10) ?? null;
  const complete = coversMetaPeriod(from, toExclusive, windows);
  return {
    spendCents: complete ? totals._sum.spendCents ?? 0 : null,
    purchaseValueCents: complete ? totals._sum.purchaseValueCents ?? 0 : null,
    complete,
    through,
    syncedAt: latestSync,
  };
}
