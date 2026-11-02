import type { CampaignWithSpend } from "./campaign-results";

export const SEGMENTS = [
  { value: "mobile-grooming", label: "Mobile Grooming" },
  { value: "in-house-grooming", label: "In-House Grooming" },
  { value: "generic-grooming", label: "Generic Grooming" },
  { value: "boarding", label: "Boarding" },
  { value: "daycare", label: "Daycare" },
  { value: "training", label: "Training" },
  { value: "unassigned", label: "Unassigned" },
] as const;
export type CampaignSegment = typeof SEGMENTS[number]["value"];
export type SegmentCampaign = { source: string; id: string; name: string; aliases: string[]; segment: CampaignSegment; saved: boolean };
export const campaignIdentity = (source: string, id: string) => `${source}|${id}`;
export const normalizeCampaignName = (name: string) => name.trim().toLowerCase().replace(/[\s_-]+/g, " ");
export function suggestedSegment(name: string): CampaignSegment {
  const text = normalizeCampaignName(name);
  const matches: CampaignSegment[] = [];
  if (/\b(boarding|board)\b/.test(text)) matches.push("boarding");
  if (/\b(daycare|day care)\b/.test(text)) matches.push("daycare");
  if (/\b(training|train)\b/.test(text)) matches.push("training");
  if (/\bgrooming\b/.test(text)) matches.push(/\bmobile\b/.test(text) ? "mobile-grooming" : /\bin house\b/.test(text) ? "in-house-grooming" : "generic-grooming");
  return matches.length === 1 ? matches[0] : "unassigned";
}
export function segmentForCampaign(row: Pick<CampaignWithSpend, "source" | "id" | "name">, catalog: SegmentCampaign[]): CampaignSegment {
  const source = catalog.filter((item) => item.source === row.source);
  const exact = row.id ? source.find((item) => item.id === row.id || item.aliases.includes(row.id!)) : undefined;
  if (exact) return exact.segment;
  const names = source.filter((item) => normalizeCampaignName(item.name) === normalizeCampaignName(row.name));
  return names.length === 1 ? names[0].segment : row.source === "unattributed" ? "unassigned" : suggestedSegment(row.name);
}
export function groupCampaignSegments(rows: CampaignWithSpend[], catalog: SegmentCampaign[]) {
  return SEGMENTS.map((segment) => ({ ...segment, campaigns: rows.filter((row) => segmentForCampaign(row, catalog) === segment.value) })).filter((group) => group.campaigns.length > 0);
}

/** Legacy lead exports put phone numbers in the campaign ID column. */
export const isPhoneCampaignId = (id: string) => /^[+\d ()-]+$/.test(id) && [10, 11].includes(id.replace(/\D/g, "").length);
