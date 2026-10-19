import type { LeadAttributionSource } from "./lead-attribution";
import type { MetaSpendCampaign } from "./meta-spend-breakdown";

export type ReportCampaign = {
  source: LeadAttributionSource;
  campaignId: string | null;
  campaignName: string;
  adsetId: string | null;
  adsetName: string | null;
  adId: string | null;
  adName: string | null;
  leads: number;
};

export type OutcomeCampaign = {
  source: LeadAttributionSource;
  campaignId: string | null;
  campaignName: string;
  leads: number;
  bookedLeads: number;
  appointments: number;
  netPaidCents: number;
};

export type CombinedCampaign = {
  source: LeadAttributionSource;
  id: string | null;
  name: string;
  formLeads: number;
  linked: number;
  bookedLeads: number;
  appointments: number;
  netPaidCents: number;
  ads: ReportCampaign[];
};

export type SpendCampaign = CombinedCampaign & { metaSpend?: MetaSpendCampaign; spendMatchedByName?: boolean };

export type GoogleSpendCampaign = { id: string | null; name: string; spendCents: number };
export type CampaignWithSpend = SpendCampaign & { googleSpend?: GoogleSpendCampaign };

export function aggregateGoogleSpend(rows: { campaignId: string | null; campaign: string; costCents: number | null }[]): GoogleSpendCampaign[] {
  const byId = new Map<string, GoogleSpendCampaign>();
  let unmatchedCents = 0;
  for (const row of rows) {
    if (row.costCents === null) continue;
    if (!row.campaignId) {
      unmatchedCents += row.costCents;
      continue;
    }
    const campaign = byId.get(row.campaignId) ?? { id: row.campaignId, name: row.campaign, spendCents: 0 };
    campaign.spendCents += row.costCents;
    byId.set(row.campaignId, campaign);
  }
  return [...byId.values(), ...(unmatchedCents ? [{ id: null, name: "Google Ads spend without a campaign ID", spendCents: unmatchedCents }] : [])];
}

/** Match Google Ads spend by campaign ID; form tags that use another name remain separate. */
export function attachGoogleSpendCampaigns(campaigns: SpendCampaign[], spend: GoogleSpendCampaign[] | null): CampaignWithSpend[] {
  if (spend === null) return campaigns;
  const byId = new Map<string, GoogleSpendCampaign>();
  for (const row of spend) {
    if (row.id) byId.set(row.id, row);
  }
  const matched = new Set<string>();
  const result: CampaignWithSpend[] = campaigns.map((campaign) => {
    const googleSpend = campaign.source === "google-ads" && campaign.id ? byId.get(campaign.id) : undefined;
    if (googleSpend?.id) matched.add(googleSpend.id);
    return googleSpend ? { ...campaign, name: googleSpend.name, googleSpend } : campaign;
  });
  for (const googleSpend of spend) {
    if (googleSpend.spendCents <= 0 || (googleSpend.id && matched.has(googleSpend.id))) continue;
    result.push({ source: "google-ads", id: googleSpend.id, name: googleSpend.name,
      formLeads: 0, linked: 0, bookedLeads: 0, appointments: 0, netPaidCents: 0, ads: [], googleSpend });
  }
  return result;
}

/** Include Meta campaigns with spend even when no website form carried their campaign ID. */
export function attachMetaSpendCampaigns(campaigns: CombinedCampaign[], spend: MetaSpendCampaign[] | null): SpendCampaign[] {
  if (spend === null) return campaigns;
  const byId = new Map(spend.filter((row) => row.id !== null).map((row) => [row.id, row]));
  const byUniqueName = new Map<string, MetaSpendCampaign | null>();
  for (const row of spend) {
    byUniqueName.set(row.name, byUniqueName.has(row.name) ? null : row);
  }
  const matched = new Set<string>();
  const result: SpendCampaign[] = campaigns.map((campaign) => {
    const idMatch = campaign.source === "meta" && campaign.id ? byId.get(campaign.id) : undefined;
    const nameMatch = campaign.source === "meta" && (!campaign.id || campaign.id === campaign.name)
      ? byUniqueName.get(campaign.name) ?? undefined : undefined;
    const metaSpend = idMatch ?? nameMatch;
    const spendMatchedByName = Boolean(metaSpend && !idMatch);
    if (metaSpend?.id) matched.add(metaSpend.id);
    return metaSpend ? { ...campaign, name: metaSpend.name, metaSpend, spendMatchedByName } : campaign;
  });
  for (const metaSpend of spend) {
    if (metaSpend.id && matched.has(metaSpend.id)) continue;
    result.push({ source: "meta", id: metaSpend.id, name: metaSpend.name,
      formLeads: 0, linked: 0, bookedLeads: 0, appointments: 0, netPaidCents: 0, ads: [], metaSpend });
  }
  return result;
}

export function combineCampaignRows(forms: ReportCampaign[], outcomes: OutcomeCampaign[]): CombinedCampaign[] {
  const groups = new Map<string, CombinedCampaign>();
  const keyFor = (source: LeadAttributionSource, id: string | null) => `${source}|${id ?? ""}`;
  for (const row of forms) {
    const key = keyFor(row.source, row.campaignId);
    const group = groups.get(key) ?? {
      source: row.source, id: row.campaignId, name: row.campaignName,
      formLeads: 0, linked: 0, bookedLeads: 0, appointments: 0, netPaidCents: 0, ads: [],
    };
    group.formLeads += row.leads;
    group.ads.push(row);
    groups.set(key, group);
  }
  for (const row of outcomes) {
    const key = keyFor(row.source, row.campaignId);
    const group = groups.get(key) ?? {
      source: row.source, id: row.campaignId, name: row.campaignName,
      formLeads: 0, linked: 0, bookedLeads: 0, appointments: 0, netPaidCents: 0, ads: [],
    };
    group.linked = row.leads;
    group.bookedLeads = row.bookedLeads;
    group.appointments = row.appointments;
    group.netPaidCents = row.netPaidCents;
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => b.formLeads - a.formLeads || b.netPaidCents - a.netPaidCents || a.name.localeCompare(b.name));
}
