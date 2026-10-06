import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  attributionText,
  classifyLeadAttribution,
  type LeadAttributionSource,
  type SubmissionAttribution,
} from "@/lib/marketing/lead-attribution";
import { resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";

const SOURCES = new Set(["all", "meta", "google-ads", "google-lsa"]);

function canAccess(user: { role?: string | null; jobTitle?: string | null } | undefined) {
  return Boolean(user && hasMarketingAccess(user.role, user.jobTitle));
}

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!canAccess(session?.user as { role?: string | null; jobTitle?: string | null } | undefined)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sourceParam = request.nextUrl.searchParams.get("source") || "all";
  if (!SOURCES.has(sourceParam)) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const from = request.nextUrl.searchParams.get("from") || undefined;
  const to = request.nextUrl.searchParams.get("to") || undefined;
  const range = resolveSubmissionDateRange(from, to);
  const submissions = await prisma.websiteFormSubmission.findMany({
    where: {
      company: { in: ["RESORT", "GROOMING"] },
      receivedAt: { gte: range.startAt, lt: range.endBefore },
    },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      company: true,
      receivedAt: true,
      firstName: true,
      lastName: true,
      services: true,
      attribution: true,
      status: true,
      moegoLeadId: true,
    },
  });

  const normalized = submissions.map((submission) => {
    const attribution = submission.attribution as SubmissionAttribution;
    return {
      ...submission,
      attribution,
      source: classifyLeadAttribution(attribution),
      campaignId: attributionText(attribution, "utm_campaign"),
      adsetId: attributionText(attribution, "utm_term"),
      adId: attributionText(attribution, "utm_content"),
    };
  });

  const metaRows = normalized.filter((row) => row.source === "meta");
  const metaCampaignIds = [...new Set(metaRows.flatMap((row) => row.campaignId ? [row.campaignId] : []))];
  const metaAdsetIds = [...new Set(metaRows.flatMap((row) => row.adsetId ? [row.adsetId] : []))];
  const metaAdIds = [...new Set(metaRows.flatMap((row) => row.adId ? [row.adId] : []))];
  const googleCampaignIds = [...new Set(normalized
    .filter((row) => row.source === "google-ads")
    .flatMap((row) => row.campaignId ? [row.campaignId] : []))];

  const [metaInsights, googleCampaigns] = await Promise.all([
    metaCampaignIds.length || metaAdsetIds.length || metaAdIds.length
      ? prisma.metaAdInsight.findMany({
          where: {
            OR: [
              ...(metaCampaignIds.length ? [{ campaignId: { in: metaCampaignIds } }] : []),
              ...(metaAdsetIds.length ? [{ adsetId: { in: metaAdsetIds } }] : []),
              ...(metaAdIds.length ? [{ adId: { in: metaAdIds } }] : []),
            ],
          },
          orderBy: { date: "desc" },
          select: { campaignId: true, campaignName: true, adsetId: true, adsetName: true, adId: true, adName: true },
        })
      : Promise.resolve([]),
    googleCampaignIds.length
      ? prisma.financeGoogleCampaignReportRow.findMany({
          where: {
            campaignId: { in: googleCampaignIds },
            business: { in: ["pet-resort", "pet-resort-manual", "mobile-grooming", "mobile-grooming-manual", "all-businesses", "all-businesses-manual"] },
          },
          orderBy: { updatedAt: "desc" },
          select: { campaignId: true, campaign: true },
        })
      : Promise.resolve([]),
  ]);

  const campaignNames = new Map<string, string>();
  const adsetNames = new Map<string, string>();
  const adNames = new Map<string, string>();
  for (const insight of metaInsights) {
    if (insight.campaignId && insight.campaignName && !campaignNames.has(insight.campaignId)) campaignNames.set(insight.campaignId, insight.campaignName);
    if (insight.adsetId && insight.adsetName && !adsetNames.has(insight.adsetId)) adsetNames.set(insight.adsetId, insight.adsetName);
    if (insight.adId && insight.adName && !adNames.has(insight.adId)) adNames.set(insight.adId, insight.adName);
  }
  for (const campaign of googleCampaigns) {
    if (campaign.campaignId && !campaignNames.has(campaign.campaignId)) campaignNames.set(campaign.campaignId, campaign.campaign);
  }

  const sourceCounts: Record<LeadAttributionSource, number> = {
    meta: 0,
    "google-ads": 0,
    "google-lsa": 0,
    unattributed: 0,
  };
  for (const row of normalized) sourceCounts[row.source] += 1;

  const selected = sourceParam === "all"
    ? normalized
    : normalized.filter((row) => row.source === sourceParam);
  const campaignGroups = new Map<string, {
    source: LeadAttributionSource;
    campaignId: string | null;
    campaignName: string;
    adsetId: string | null;
    adsetName: string | null;
    adId: string | null;
    adName: string | null;
    leads: number;
  }>();

  for (const row of selected) {
    const campaignName = row.campaignId
      ? campaignNames.get(row.campaignId) || row.campaignId
      : row.source === "unattributed" ? "Unattributed" : "Campaign not supplied";
    const key = [row.source, row.campaignId, row.adsetId, row.adId].join("|");
    const existing = campaignGroups.get(key);
    if (existing) existing.leads += 1;
    else campaignGroups.set(key, {
      source: row.source,
      campaignId: row.campaignId,
      campaignName,
      adsetId: row.adsetId,
      adsetName: row.adsetId ? adsetNames.get(row.adsetId) || null : null,
      adId: row.adId,
      adName: row.adId ? adNames.get(row.adId) || null : null,
      leads: 1,
    });
  }

  const attributed = normalized.length - sourceCounts.unattributed;
  return NextResponse.json({
    range: { from: range.start, to: range.end },
    totals: {
      submissions: normalized.length,
      attributed,
      attributionRate: normalized.length ? attributed / normalized.length : 0,
      sourceCounts,
      selected: selected.length,
    },
    campaigns: [...campaignGroups.values()].sort((a, b) => b.leads - a.leads || a.campaignName.localeCompare(b.campaignName)),
    leads: selected.slice(0, 50).map((row) => ({
      id: row.id,
      business: row.company === "RESORT" ? "Pet Resort" : "Mobile Grooming",
      receivedAt: row.receivedAt,
      customer: [row.firstName, row.lastName].filter(Boolean).join(" ") || "Unvalidated",
      services: row.services,
      source: row.source,
      campaignId: row.campaignId,
      campaignName: row.campaignId ? campaignNames.get(row.campaignId) || row.campaignId : null,
      adsetName: row.adsetId ? adsetNames.get(row.adsetId) || row.adsetId : null,
      adName: row.adId ? adNames.get(row.adId) || row.adId : null,
      syncedToMoego: row.status === "SYNCED" && Boolean(row.moegoLeadId),
    })),
  });
}
