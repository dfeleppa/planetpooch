import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { attributionText, classifyLeadAttribution, type SubmissionAttribution } from "./lead-attribution";
import { SEGMENTS, isPhoneCampaignId, campaignIdentity, normalizeCampaignName, suggestedSegment, type SegmentCampaign } from "./campaign-segments";

/** All imported campaigns, plus historical website campaign tags without a platform match. */
export const getCampaignSegmentCatalog = cache(async (): Promise<SegmentCampaign[]> => {
  const [meta, facebookImports, google, googleAssignments, forms, saved] = await Promise.all([
    prisma.metaAdInsight.findMany({ where: { campaignId: { not: null } }, distinct: ["campaignId"], orderBy: { date: "desc" }, select: { campaignId: true, campaignName: true } }),
    prisma.financeFacebookCampaignReportRow.findMany({ distinct: ["campaignId", "campaign"], orderBy: { updatedAt: "desc" }, select: { campaignId: true, campaign: true } }),
    prisma.financeGoogleCampaignReportRow.findMany({ distinct: ["campaignId", "campaign"], orderBy: { updatedAt: "desc" }, select: { campaignId: true, campaign: true } }),
    prisma.googleAdsCampaignBusiness.findMany({ select: { campaignId: true, campaign: true } }),
    prisma.websiteFormSubmission.findMany({ where: { company: { in: ["RESORT", "GROOMING"] } }, distinct: ["attribution"], select: { attribution: true } }),
    prisma.marketingCampaignSegment.findMany(),
  ]);
  const catalog = new Map<string, SegmentCampaign>();
  const add = (source: string, id: string, name: string) => {
    const key = campaignIdentity(source, id);
    if (!catalog.has(key)) catalog.set(key, { source, id, name, aliases: [], segment: suggestedSegment(name), saved: false });
  };
  for (const row of meta) add("meta", row.campaignId!, row.campaignName || row.campaignId!);
  for (const row of facebookImports) if (row.campaignId && !isPhoneCampaignId(row.campaignId)) add("meta", row.campaignId, row.campaign);
  for (const row of googleAssignments) add("google-ads", row.campaignId, row.campaign);
  for (const row of google) if (row.campaignId) add("google-ads", row.campaignId, row.campaign);
  const platformRows = [...catalog.values()];
  const addTag = (source: string, tag: string) => {
    if (catalog.has(campaignIdentity(source, tag))) return;
    const matches = platformRows.filter((row) => row.source === source && normalizeCampaignName(row.name) === normalizeCampaignName(tag));
    if (matches.length === 1) {
      if (!matches[0].aliases.includes(tag)) matches[0].aliases.push(tag);
    } else add(source, tag, tag);
  };
  for (const row of facebookImports) if (!row.campaignId && row.campaign) addTag("meta", row.campaign);
  for (const row of google) if (!row.campaignId && row.campaign) addTag("google-ads", row.campaign);
  for (const row of forms) {
    const attribution = row.attribution && typeof row.attribution === "object" && !Array.isArray(row.attribution) ? row.attribution as SubmissionAttribution : {};
    const source = classifyLeadAttribution(attribution);
    const tag = attributionText(attribution, "utm_campaign");
    if (source !== "unattributed" && tag) addTag(source, tag);
  }
  for (const item of catalog.values()) {
    const exact = saved.find((row) => row.source === item.source && row.campaignId === item.id);
    const aliases = saved.filter((row) => row.source === item.source && item.aliases.includes(row.campaignId));
    const assignment = exact ?? (new Set(aliases.map((row) => row.segment)).size === 1 ? aliases[0] : undefined);
    const segment = SEGMENTS.find((segment) => segment.value === assignment?.segment);
    if (segment) { item.segment = segment.value; item.saved = true; }
  }
  return [...catalog.values()].sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
});
