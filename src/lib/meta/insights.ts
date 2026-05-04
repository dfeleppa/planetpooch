import { getMetaConfig, graphGetPaginated } from "./client";

/**
 * Subset of Meta's insights schema that we persist. Insights API returns
 * many more fields; we ask only for what we store + a few we'll likely
 * surface next (campaign/adset names for grouping).
 */
const INSIGHT_FIELDS = [
  "ad_id",
  "ad_name",
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "date_start",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "inline_link_clicks",
  "video_thruplay_watched_actions",
  "actions",
  "action_values",
].join(",");

/** What Meta returns per row when `level=ad` and `time_increment=1`. */
type RawInsight = {
  ad_id: string;
  ad_name: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  date_start: string; // YYYY-MM-DD in the ad account's timezone
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  inline_link_clicks?: string;
  video_thruplay_watched_actions?: { action_type: string; value: string }[];
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
};

/** What our DB layer wants. Money is cents; everything is concrete. */
export type NormalizedInsight = {
  adId: string;
  adName: string;
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  date: string; // YYYY-MM-DD
  spendCents: number;
  impressions: number;
  reach: number | null;
  frequency: number | null;
  linkClicks: number;
  videoPlays3s: number | null;
  videoThruplays: number | null;
  purchases: number;
  purchaseValueCents: number;
  leads: number;
};

function toCents(dollars: string | undefined): number {
  if (!dollars) return 0;
  const n = Number(dollars);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function toInt(v: string | undefined): number {
  if (!v) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function toIntOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function toFloatOrNull(v: string | undefined): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Sum video-watched actions across action types. Meta returns a list keyed
 * by action_type (e.g. "video_view"); for a single ad there's typically one
 * entry but we sum defensively.
 */
function sumActions(
  actions: { action_type: string; value: string }[] | undefined
): number | null {
  if (!actions || actions.length === 0) return null;
  let total = 0;
  for (const a of actions) total += toInt(a.value);
  return total;
}

/**
 * Pull purchase count and purchase value out of the generic actions /
 * action_values arrays. Meta uses several action_type variants for
 * purchases depending on pixel/CAPI setup; we accept any of them.
 */
const PURCHASE_TYPES = new Set([
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "offsite_conversion.custom",
]);

function extractActionByType(
  actions: { action_type: string; value: string }[] | undefined,
  type: string
): number | null {
  if (!actions) return null;
  let total = 0;
  let found = false;
  for (const a of actions) {
    if (a.action_type === type) {
      total += toInt(a.value);
      found = true;
    }
  }
  return found ? total : null;
}

function extractPurchases(
  actions: { action_type: string; value: string }[] | undefined
): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (PURCHASE_TYPES.has(a.action_type)) total += toInt(a.value);
  }
  return total;
}

/**
 * Lead conversions across every Meta variant. `lead` covers Instant Forms,
 * the `lead_grouped` variants are newer aggregated reporting, and the
 * pixel variant covers website-side lead events. If the account uses a
 * named custom conversion for leads, map it here once you know its
 * action_type (it'll appear as `offsite_conversion.custom.<name>`).
 */
const LEAD_TYPES = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
]);

function extractLeads(
  actions: { action_type: string; value: string }[] | undefined
): number {
  if (!actions) return 0;
  let total = 0;
  for (const a of actions) {
    if (LEAD_TYPES.has(a.action_type)) total += toInt(a.value);
  }
  return total;
}

function extractPurchaseValueCents(
  actionValues: { action_type: string; value: string }[] | undefined
): number {
  if (!actionValues) return 0;
  let total = 0;
  for (const a of actionValues) {
    if (PURCHASE_TYPES.has(a.action_type)) total += toCents(a.value);
  }
  return total;
}

function normalize(row: RawInsight): NormalizedInsight {
  return {
    adId: row.ad_id,
    adName: row.ad_name,
    campaignId: row.campaign_id ?? null,
    campaignName: row.campaign_name ?? null,
    adsetId: row.adset_id ?? null,
    adsetName: row.adset_name ?? null,
    date: row.date_start,
    spendCents: toCents(row.spend),
    impressions: toInt(row.impressions),
    reach: toIntOrNull(row.reach),
    frequency: toFloatOrNull(row.frequency),
    linkClicks: toInt(row.inline_link_clicks),
    videoPlays3s: extractActionByType(row.actions, "video_view"),
    videoThruplays: sumActions(row.video_thruplay_watched_actions),
    purchases: extractPurchases(row.actions),
    purchaseValueCents: extractPurchaseValueCents(row.action_values),
    leads: extractLeads(row.actions),
  };
}

/**
 * Fetch per-day, per-ad insights for the given window. `since`/`until` are
 * inclusive `YYYY-MM-DD`. The Insights API returns one row per (ad, day),
 * which is what we want — we upsert by `(adId, date)`.
 */
export async function fetchInsights(window: {
  since: string;
  until: string;
}): Promise<NormalizedInsight[]> {
  const { adAccountId } = getMetaConfig();
  const raw = await graphGetPaginated<RawInsight>(
    `/${adAccountId}/insights`,
    {
      level: "ad",
      time_increment: "1",
      time_range: JSON.stringify({ since: window.since, until: window.until }),
      fields: INSIGHT_FIELDS,
      limit: "500",
    }
  );
  return raw.map(normalize);
}
