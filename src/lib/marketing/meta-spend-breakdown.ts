import { prisma } from "@/lib/prisma";

export type MetaSpendAd = { id: string; name: string; spendCents: number };
export type MetaSpendAdset = { id: string | null; name: string; spendCents: number; ads: MetaSpendAd[] };
export type MetaSpendCampaign = { id: string | null; name: string; spendCents: number; adsets: MetaSpendAdset[] };

export type MetaSpendInsight = {
  campaignId: string | null; campaignName: string | null;
  adsetId: string | null; adsetName: string | null;
  adId: string; adName: string; spendCents: number;
};

/** Roll up the same ad-day insight rows used for the Meta source total. */
export function aggregateMetaSpend(rows: MetaSpendInsight[]): MetaSpendCampaign[] {
  const campaigns = new Map<string, MetaSpendCampaign>();
  const adsetMaps = new Map<string, Map<string, MetaSpendAdset>>();
  const adMaps = new Map<string, Map<string, MetaSpendAd>>();
  for (const row of rows) {
    const campaignKey = row.campaignId ?? "";
    let campaign = campaigns.get(campaignKey);
    if (!campaign) {
      campaign = { id: row.campaignId, name: row.campaignName || row.campaignId || "Meta campaign ID unavailable", spendCents: 0, adsets: [] };
      campaigns.set(campaignKey, campaign);
      adsetMaps.set(campaignKey, new Map());
    }
    campaign.spendCents += row.spendCents;

    const adsetKey = `${campaignKey}|${row.adsetId ?? ""}`;
    const campaignAdsets = adsetMaps.get(campaignKey)!;
    let adset = campaignAdsets.get(adsetKey);
    if (!adset) {
      adset = { id: row.adsetId, name: row.adsetName || row.adsetId || "Ad set ID unavailable", spendCents: 0, ads: [] };
      campaignAdsets.set(adsetKey, adset);
      campaign.adsets.push(adset);
      adMaps.set(adsetKey, new Map());
    }
    adset.spendCents += row.spendCents;

    const ads = adMaps.get(adsetKey)!;
    let ad = ads.get(row.adId);
    if (!ad) {
      ad = { id: row.adId, name: row.adName || row.adId, spendCents: 0 };
      ads.set(row.adId, ad);
      adset.ads.push(ad);
    }
    ad.spendCents += row.spendCents;
  }
  return [...campaigns.values()]
    .sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name))
    .map((campaign) => ({ ...campaign, adsets: campaign.adsets
      .sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name))
      .map((adset) => ({ ...adset, ads: adset.ads.sort((a, b) => b.spendCents - a.spendCents || a.name.localeCompare(b.name)) })) }));
}

export async function getMetaSpendBreakdown(from: Date, toExclusive: Date): Promise<MetaSpendCampaign[]> {
  const rows = await prisma.metaAdInsight.findMany({
    where: { date: { gte: from, lt: toExclusive } },
    orderBy: { date: "desc" },
    select: { campaignId: true, campaignName: true, adsetId: true, adsetName: true, adId: true, adName: true, spendCents: true },
  });
  return aggregateMetaSpend(rows);
}
