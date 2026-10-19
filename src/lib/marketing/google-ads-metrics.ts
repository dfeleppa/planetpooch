export type GoogleAdsApiRow = {
  campaign?: { id?: string; name?: string; status?: string };
  metrics?: { clicks?: string; costMicros?: string; impressions?: string };
};

export function normalizeGoogleAdsCampaign(row: GoogleAdsApiRow) {
  if (!row.campaign?.id) return null;
  const clicks = Number(row.metrics?.clicks ?? 0);
  const impressions = Number(row.metrics?.impressions ?? 0);
  const micros = Number(row.metrics?.costMicros ?? 0);
  if (![clicks, impressions, micros].every((value) => Number.isFinite(value) && value >= 0)) {
    throw new Error("Google Ads returned an invalid campaign metric.");
  }
  return {
    id: row.campaign.id,
    name: row.campaign.name ?? row.campaign.id,
    status: row.campaign.status ?? "UNKNOWN",
    clicks,
    costCents: Math.round(micros / 10_000),
    impressions,
  };
}
