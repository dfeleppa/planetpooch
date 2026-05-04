import { prisma } from "@/lib/prisma";

export type AdAggregate = {
  adId: string;
  adName: string;
  campaignName: string | null;
  scriptId: string | null;
  scriptIdeaTitle: string | null;
  spendCents: number;
  impressions: number;
  reach: number | null;
  linkClicks: number;
  videoPlays3s: number | null;
  videoThruplays: number | null;
  purchases: number;
  purchaseValueCents: number;
  /** First day we have data for this ad in the window. */
  firstDate: Date;
  /** Most recent day we have data for this ad. */
  lastDate: Date;
};

/**
 * Aggregate per-day insights into per-ad totals over the trailing N days.
 * Sorted by spend desc — the marketer's first question is always "where
 * is the money going?"
 */
export async function getAdAggregates(days = 30): Promise<AdAggregate[]> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  // Group by ad. We pick the most recent (adName, campaignName) per ad so
  // renames in Ads Manager show through.
  const rows = await prisma.metaAdInsight.findMany({
    where: { date: { gte: since } },
    orderBy: { date: "desc" },
    include: {
      script: { select: { id: true, idea: { select: { title: true } } } },
    },
  });

  const byAd = new Map<string, AdAggregate>();
  for (const r of rows) {
    const existing = byAd.get(r.adId);
    if (!existing) {
      byAd.set(r.adId, {
        adId: r.adId,
        adName: r.adName,
        campaignName: r.campaignName,
        scriptId: r.script?.id ?? null,
        scriptIdeaTitle: r.script?.idea.title ?? null,
        spendCents: r.spendCents,
        impressions: r.impressions,
        reach: r.reach,
        linkClicks: r.linkClicks,
        videoPlays3s: r.videoPlays3s,
        videoThruplays: r.videoThruplays,
        purchases: r.purchases,
        purchaseValueCents: r.purchaseValueCents,
        firstDate: r.date,
        lastDate: r.date,
      });
      continue;
    }
    existing.spendCents += r.spendCents;
    existing.impressions += r.impressions;
    if (r.reach !== null) existing.reach = (existing.reach ?? 0) + r.reach;
    existing.linkClicks += r.linkClicks;
    if (r.videoPlays3s !== null) {
      existing.videoPlays3s = (existing.videoPlays3s ?? 0) + r.videoPlays3s;
    }
    if (r.videoThruplays !== null) {
      existing.videoThruplays =
        (existing.videoThruplays ?? 0) + r.videoThruplays;
    }
    existing.purchases += r.purchases;
    existing.purchaseValueCents += r.purchaseValueCents;
    if (r.date < existing.firstDate) existing.firstDate = r.date;
    if (r.date > existing.lastDate) existing.lastDate = r.date;
  }

  return Array.from(byAd.values()).sort((a, b) => b.spendCents - a.spendCents);
}

/** Aggregate insights linked to a specific Script over the trailing N days. */
export async function getScriptPerformance(
  scriptId: string,
  days = 30
): Promise<{
  spendCents: number;
  impressions: number;
  linkClicks: number;
  videoPlays3s: number | null;
  videoThruplays: number | null;
  purchases: number;
  purchaseValueCents: number;
  /** Number of distinct ads we have data for. */
  adCount: number;
} | null> {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));

  const rows = await prisma.metaAdInsight.findMany({
    where: { scriptId, date: { gte: since } },
    select: {
      adId: true,
      spendCents: true,
      impressions: true,
      linkClicks: true,
      videoPlays3s: true,
      videoThruplays: true,
      purchases: true,
      purchaseValueCents: true,
    },
  });
  if (rows.length === 0) return null;

  const adIds = new Set<string>();
  let spendCents = 0;
  let impressions = 0;
  let linkClicks = 0;
  let videoPlays3s: number | null = null;
  let videoThruplays: number | null = null;
  let purchases = 0;
  let purchaseValueCents = 0;
  for (const r of rows) {
    adIds.add(r.adId);
    spendCents += r.spendCents;
    impressions += r.impressions;
    linkClicks += r.linkClicks;
    if (r.videoPlays3s !== null) {
      videoPlays3s = (videoPlays3s ?? 0) + r.videoPlays3s;
    }
    if (r.videoThruplays !== null) {
      videoThruplays = (videoThruplays ?? 0) + r.videoThruplays;
    }
    purchases += r.purchases;
    purchaseValueCents += r.purchaseValueCents;
  }
  return {
    spendCents,
    impressions,
    linkClicks,
    videoPlays3s,
    videoThruplays,
    purchases,
    purchaseValueCents,
    adCount: adIds.size,
  };
}

export function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function formatHookRate(
  videoPlays3s: number | null,
  impressions: number
): string {
  if (videoPlays3s === null || impressions === 0) return "—";
  return `${((videoPlays3s / impressions) * 100).toFixed(1)}%`;
}

export function formatHoldRate(
  thruplays: number | null,
  videoPlays3s: number | null
): string {
  if (thruplays === null || videoPlays3s === null || videoPlays3s === 0) {
    return "—";
  }
  return `${((thruplays / videoPlays3s) * 100).toFixed(1)}%`;
}

export function formatRoas(
  purchaseValueCents: number,
  spendCents: number
): string {
  if (spendCents === 0) return "—";
  return (purchaseValueCents / spendCents).toFixed(2);
}
