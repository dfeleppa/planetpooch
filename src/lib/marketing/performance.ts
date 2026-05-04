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

export const SORTABLE_COLUMNS = [
  "spend",
  "impressions",
  "hookRate",
  "holdRate",
  "ctr",
  "purchases",
  "roas",
] as const;
export type SortColumn = (typeof SORTABLE_COLUMNS)[number];
export type SortDir = "asc" | "desc";

export const DAY_PRESETS = [7, 30, 90] as const;
export type DayPreset = (typeof DAY_PRESETS)[number];

export type AggregateOptions = {
  days?: number;
  /** Filter to a single campaign name; undefined/empty = all campaigns. */
  campaign?: string;
  /** Filter to ads linked to this scriptId. */
  scriptId?: string;
  sort?: SortColumn;
  dir?: SortDir;
};

function windowStart(days: number): Date {
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  since.setUTCDate(since.getUTCDate() - (days - 1));
  return since;
}

/** Shape that any sortable row needs. Both AdAggregate and ScriptLeaderboardRow satisfy this. */
type MetricRow = {
  spendCents: number;
  impressions: number;
  linkClicks: number;
  videoPlays3s: number | null;
  videoThruplays: number | null;
  purchases: number;
  purchaseValueCents: number;
};

/** Numeric value of a sortable column for any metric row. Null = no data; sorts last. */
function sortValue(a: MetricRow, col: SortColumn): number | null {
  switch (col) {
    case "spend":
      return a.spendCents;
    case "impressions":
      return a.impressions;
    case "purchases":
      return a.purchases;
    case "hookRate":
      if (a.videoPlays3s === null || a.impressions === 0) return null;
      return a.videoPlays3s / a.impressions;
    case "holdRate":
      if (
        a.videoThruplays === null ||
        a.videoPlays3s === null ||
        a.videoPlays3s === 0
      ) {
        return null;
      }
      return a.videoThruplays / a.videoPlays3s;
    case "ctr":
      if (a.impressions === 0) return null;
      return a.linkClicks / a.impressions;
    case "roas":
      if (a.spendCents === 0) return null;
      return a.purchaseValueCents / a.spendCents;
  }
}

function compareMetricRows(
  a: MetricRow,
  b: MetricRow,
  col: SortColumn,
  dir: SortDir
): number {
  const av = sortValue(a, col);
  const bv = sortValue(b, col);
  // Nulls always sort last regardless of direction — they're "no data",
  // not a low value.
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  return dir === "asc" ? av - bv : bv - av;
}

/**
 * Aggregate per-day insights into per-ad totals over the trailing N days,
 * optionally filtered by campaign and sorted by the requested column.
 */
export async function getAdAggregates(
  options: AggregateOptions = {}
): Promise<AdAggregate[]> {
  const days = options.days ?? 30;
  const sort = options.sort ?? "spend";
  const dir = options.dir ?? "desc";
  const campaign = options.campaign?.trim() || undefined;
  const scriptId = options.scriptId;

  // Group by ad. We pick the most recent (adName, campaignName) per ad so
  // renames in Ads Manager show through.
  const rows = await prisma.metaAdInsight.findMany({
    where: {
      date: { gte: windowStart(days) },
      ...(campaign ? { campaignName: campaign } : {}),
      ...(scriptId ? { scriptId } : {}),
    },
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

  return Array.from(byAd.values()).sort((a, b) =>
    compareMetricRows(a, b, sort, dir)
  );
}

export type ScriptLeaderboardRow = {
  scriptId: string;
  ideaId: string;
  ideaTitle: string;
  platform: string;
  status: string;
  metaAdSlug: string | null;
  spendCents: number;
  impressions: number;
  linkClicks: number;
  videoPlays3s: number | null;
  videoThruplays: number | null;
  purchases: number;
  purchaseValueCents: number;
  /** Distinct ads contributing to this script's totals in the window. */
  adCount: number;
  /** Most recent insight date — useful for spotting stale scripts. */
  lastDate: Date;
};

export type LeaderboardOptions = {
  days?: number;
  sort?: SortColumn;
  dir?: SortDir;
};

/**
 * Per-script aggregates over the trailing N days, joined with script
 * metadata for display. Only includes scripts that have at least one
 * linked insight in the window — scripts with no ad activity aren't
 * useful here.
 */
export async function getScriptLeaderboard(
  options: LeaderboardOptions = {}
): Promise<ScriptLeaderboardRow[]> {
  const days = options.days ?? 30;
  const sort = options.sort ?? "spend";
  const dir = options.dir ?? "desc";

  const rows = await prisma.metaAdInsight.findMany({
    where: {
      date: { gte: windowStart(days) },
      scriptId: { not: null },
    },
    select: {
      adId: true,
      date: true,
      spendCents: true,
      impressions: true,
      linkClicks: true,
      videoPlays3s: true,
      videoThruplays: true,
      purchases: true,
      purchaseValueCents: true,
      scriptId: true,
      script: {
        select: {
          id: true,
          platform: true,
          status: true,
          metaAdSlug: true,
          idea: { select: { id: true, title: true } },
        },
      },
    },
  });

  type Acc = ScriptLeaderboardRow & { adIds: Set<string> };
  const byScript = new Map<string, Acc>();

  for (const r of rows) {
    if (!r.scriptId || !r.script) continue;
    let row = byScript.get(r.scriptId);
    if (!row) {
      row = {
        scriptId: r.scriptId,
        ideaId: r.script.idea.id,
        ideaTitle: r.script.idea.title,
        platform: r.script.platform,
        status: r.script.status,
        metaAdSlug: r.script.metaAdSlug,
        spendCents: 0,
        impressions: 0,
        linkClicks: 0,
        videoPlays3s: null,
        videoThruplays: null,
        purchases: 0,
        purchaseValueCents: 0,
        adCount: 0,
        lastDate: r.date,
        adIds: new Set<string>(),
      };
      byScript.set(r.scriptId, row);
    }
    row.spendCents += r.spendCents;
    row.impressions += r.impressions;
    row.linkClicks += r.linkClicks;
    if (r.videoPlays3s !== null) {
      row.videoPlays3s = (row.videoPlays3s ?? 0) + r.videoPlays3s;
    }
    if (r.videoThruplays !== null) {
      row.videoThruplays = (row.videoThruplays ?? 0) + r.videoThruplays;
    }
    row.purchases += r.purchases;
    row.purchaseValueCents += r.purchaseValueCents;
    row.adIds.add(r.adId);
    if (r.date > row.lastDate) row.lastDate = r.date;
  }

  const out: ScriptLeaderboardRow[] = [];
  for (const acc of byScript.values()) {
    const { adIds, ...rest } = acc;
    out.push({ ...rest, adCount: adIds.size });
  }
  return out.sort((a, b) => compareMetricRows(a, b, sort, dir));
}

export type LinkableScript = {
  id: string;
  ideaTitle: string;
  platform: string;
  status: string;
  metaAdSlug: string | null;
  createdAt: Date;
};

/**
 * Scripts that a marketer might link an ad to, ordered by most recent.
 * Capped because the picker is a flat list — if this exceeds the cap
 * regularly, swap the picker for a search input.
 */
export async function getLinkableScripts(
  limit = 200
): Promise<LinkableScript[]> {
  const rows = await prisma.script.findMany({
    select: {
      id: true,
      platform: true,
      status: true,
      metaAdSlug: true,
      createdAt: true,
      idea: { select: { title: true } },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map((r) => ({
    id: r.id,
    ideaTitle: r.idea.title,
    platform: r.platform,
    status: r.status,
    metaAdSlug: r.metaAdSlug,
    createdAt: r.createdAt,
  }));
}

/** Distinct campaign names seen in the trailing-N-day window, sorted alphabetically. */
export async function getCampaigns(days = 30): Promise<string[]> {
  const rows = await prisma.metaAdInsight.findMany({
    where: {
      date: { gte: windowStart(days) },
      campaignName: { not: null },
    },
    select: { campaignName: true },
    distinct: ["campaignName"],
  });
  const names = rows
    .map((r) => r.campaignName)
    .filter((n): n is string => n !== null);
  names.sort((a, b) => a.localeCompare(b));
  return names;
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
