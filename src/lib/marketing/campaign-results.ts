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
