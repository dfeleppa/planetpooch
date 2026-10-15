import type { LeadAttributionSource } from "./lead-attribution";

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
