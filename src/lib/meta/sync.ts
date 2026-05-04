import { prisma } from "@/lib/prisma";
import { fetchInsights, type NormalizedInsight } from "./insights";

export type SyncResult = {
  rowsFetched: number;
  rowsUpserted: number;
  linkedToScripts: number;
  windowSince: string;
  windowUntil: string;
};

/**
 * Format a Date as YYYY-MM-DD in UTC. Meta's `date_start` is in the ad
 * account's timezone, but we only need a stable string for the time_range
 * query — the API resolves the window in account-local time on its end.
 */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pull insights for the trailing N days and upsert. Re-syncing the last 7
 * days nightly is the standard pattern: Meta backfills attribution for ~3
 * days after the click, so today's numbers are still moving.
 *
 * Auto-links each row to a Script by checking if `Script.metaAdSlug`
 * appears as a substring of `adName`. The slug is set by the marketing
 * lead and pasted into the ad name in Ads Manager. Unmatched ads stay
 * unlinked — surface them in the UI so someone can fix the ad name or
 * set the slug.
 */
export async function syncRecentInsights(days = 7): Promise<SyncResult> {
  const until = new Date();
  const since = new Date(until.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const windowSince = ymd(since);
  const windowUntil = ymd(until);

  const rows = await fetchInsights({ since: windowSince, until: windowUntil });

  // Pull every script slug once; in-memory match beats N round-trips.
  const scripts = await prisma.script.findMany({
    where: { metaAdSlug: { not: null } },
    select: { id: true, metaAdSlug: true },
  });
  const slugToScriptId = new Map<string, string>();
  for (const s of scripts) {
    if (s.metaAdSlug) slugToScriptId.set(s.metaAdSlug, s.id);
  }

  function findScriptId(adName: string): string | null {
    for (const [slug, id] of slugToScriptId) {
      if (adName.includes(slug)) return id;
    }
    return null;
  }

  let linked = 0;
  for (const row of rows) {
    const scriptId = findScriptId(row.adName);
    if (scriptId) linked += 1;
    await upsertOne(row, scriptId);
  }

  return {
    rowsFetched: rows.length,
    rowsUpserted: rows.length,
    linkedToScripts: linked,
    windowSince,
    windowUntil,
  };
}

async function upsertOne(
  row: NormalizedInsight,
  scriptId: string | null
): Promise<void> {
  const data = {
    adId: row.adId,
    adName: row.adName,
    campaignId: row.campaignId,
    campaignName: row.campaignName,
    adsetId: row.adsetId,
    adsetName: row.adsetName,
    date: new Date(`${row.date}T00:00:00Z`),
    spendCents: row.spendCents,
    impressions: row.impressions,
    reach: row.reach,
    frequency: row.frequency,
    linkClicks: row.linkClicks,
    videoPlays3s: row.videoPlays3s,
    videoThruplays: row.videoThruplays,
    purchases: row.purchases,
    purchaseValueCents: row.purchaseValueCents,
    scriptId,
    syncedAt: new Date(),
  };

  await prisma.metaAdInsight.upsert({
    where: { adId_date: { adId: row.adId, date: data.date } },
    create: data,
    update: data,
  });
}
