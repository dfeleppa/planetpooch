import { prisma } from "@/lib/prisma";
import { getGoogleAdsAuthClient } from "@/lib/google";
import { addCalendarDays, formatEasternDate } from "@/lib/marketing/submission-date-range";
import { normalizeGoogleAdsCampaign, type GoogleAdsApiRow } from "./google-ads-metrics";

const API_VERSION = "v25";
const BUSINESSES = ["pet-resort", "mobile-grooming"] as const;
export type GoogleAdsBusiness = typeof BUSINESSES[number];

export class GoogleAdsConfigError extends Error {}
export class GoogleAdsApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Campaign = {
  id: string; name: string; status: string;
  clicks: number; costCents: number; impressions: number;
};

function settings() {
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID?.replace(/-/g, "");
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/-/g, "");
  const client = getGoogleAdsAuthClient();
  if (!customerId || !/^\d{10}$/.test(customerId) || !client) {
    throw new GoogleAdsConfigError("Google Ads is not configured. Add GOOGLE_ADS_CUSTOMER_ID and the dedicated Google Ads workload identity settings.");
  }
  return { customerId, loginCustomerId, client };
}

function validDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

export function validateGoogleAdsWindow(from: string, to: string) {
  if (!validDate(from) || !validDate(to)) return false;
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  const yesterday = addCalendarDays(formatEasternDate(new Date()), -1)!;
  const monthEnd = new Date(Date.UTC(Number(yesterday.slice(0, 4)), Number(yesterday.slice(5, 7)), 0)).toISOString().slice(0, 10);
  return days >= 0 && days <= 365 && from <= yesterday && to <= monthEnd;
}

export async function fetchGoogleAdsCampaigns(from: string, to: string): Promise<Campaign[]> {
  if (!validateGoogleAdsWindow(from, to)) throw new Error("Choose a valid range of at most 366 days ending today or earlier.");
  const { customerId, loginCustomerId, client } = settings();
  const accessToken = (await client.getAccessToken()).token;
  if (!accessToken) throw new GoogleAdsConfigError("Could not obtain a Google Ads access token.");
  const yesterday = addCalendarDays(formatEasternDate(new Date()), -1)!;
  const through = to < yesterday ? to : yesterday;
  const query = `SELECT campaign.id, campaign.name, campaign.status, metrics.clicks, metrics.cost_micros, metrics.impressions FROM campaign WHERE segments.date BETWEEN '${from}' AND '${through}'`;
  const rows: Campaign[] = [];
  let pageToken: string | undefined;
  do {
    const response = await fetch(`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        ...(loginCustomerId ? { "login-customer-id": loginCustomerId } : {}),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, ...(pageToken ? { pageToken } : {}) }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => ({})) as { results?: GoogleAdsApiRow[]; nextPageToken?: string; error?: { message?: string } };
    if (!response.ok) throw new GoogleAdsApiError(body.error?.message ?? "Google Ads report request failed.", response.status);
    for (const row of body.results ?? []) {
      const normalized = normalizeGoogleAdsCampaign(row);
      if (normalized) rows.push(normalized);
    }
    pageToken = body.nextPageToken || undefined;
  } while (pageToken);
  return rows;
}

export async function getGoogleAdsCampaignAssignments(from: string, to: string) {
  const campaigns = await fetchGoogleAdsCampaigns(from, to);
  const saved = await prisma.googleAdsCampaignBusiness.findMany({
    where: { campaignId: { in: campaigns.map((campaign) => campaign.id) } },
  });
  const businessById = new Map(saved.map((row) => [row.campaignId, row.business]));
  return campaigns.map((campaign) => ({ ...campaign, business: businessById.get(campaign.id) ?? null }));
}

export async function syncGoogleAdsWindow(from: string, to: string) {
  const campaigns = await getGoogleAdsCampaignAssignments(from, to);
  const unassigned = campaigns.filter((campaign) => campaign.business === null);
  if (unassigned.length) return { synced: false, unassigned: unassigned.map(({ id, name }) => ({ id, name })) };

  const periodStart = new Date(`${from}T00:00:00Z`);
  const periodEnd = new Date(`${to}T00:00:00Z`);
  await prisma.$transaction(async (tx) => {
    for (const business of BUSINESSES) {
      const previous = await tx.financeGoogleCampaignReportRow.findMany({ where: { business, periodStart, periodEnd } });
      const csvRows = previous.filter((row) => row.origin === "csv");
      if (csvRows.length) {
        await tx.googleAdsCsvBackup.upsert({
          where: { business_periodStart_periodEnd: { business, periodStart, periodEnd } },
          create: { business, periodStart, periodEnd, rows: JSON.parse(JSON.stringify(csvRows)) },
          update: {},
        });
      }
      const previousByCampaign = new Map(previous.filter((row) => row.campaignId).map((row) => [row.campaignId, row]));
      await tx.financeGoogleCampaignReportRow.deleteMany({ where: { business, periodStart, periodEnd } });
      const selected = campaigns.filter((campaign) => campaign.business === business);
      if (selected.length) await tx.financeGoogleCampaignReportRow.createMany({ data: selected.map((campaign, rowOrder) => {
        const previousRow = previousByCampaign.get(campaign.id);
        const revenueCents = previousRow?.revenueCents ?? null;
        const sales = previousRow?.sales ?? null;
        const leads = previousRow?.leads ?? null;
        return {
        business, periodStart, periodEnd, rowOrder, origin: "api",
        campaignId: campaign.id, campaign: campaign.name, status: campaign.status,
        clicks: campaign.clicks, costCents: campaign.costCents, impressions: campaign.impressions,
        cpcCents: campaign.clicks ? Math.round(campaign.costCents / campaign.clicks) : null,
        ctrPercent: campaign.impressions ? Math.round(campaign.clicks / campaign.impressions * 10_000) : null,
        revenueCents, sales, leads,
        roiPercent: revenueCents !== null && campaign.costCents ? Math.round(revenueCents / campaign.costCents * 10_000) : null,
        cpsCents: sales ? Math.round(campaign.costCents / sales) : null,
        cplCents: leads ? Math.round(campaign.costCents / leads) : null,
        averageRevenueCents: revenueCents !== null && sales ? Math.round(revenueCents / sales) : null,
      }; }) });
    }
    await tx.googleAdsSyncWindow.upsert({
      where: { from_to: { from: periodStart, to: periodEnd } },
      create: { from: periodStart, to: periodEnd },
      update: { syncedAt: new Date() },
    });
  });
  return { synced: true, from, to, campaigns: campaigns.length, unassigned: [] as { id: string; name: string }[] };
}
