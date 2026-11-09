import { prisma } from "@/lib/prisma";
import { googleAdsQuery } from "./google-ads-query";
import { validateGoogleAdsWindow } from "./google-ads-sync";
import { isLsaCampaign, lsaSpendCents, normalizeLsaCalls, type LsaCampaignRow, type LsaLeadRow } from "./google-lsa-metrics";
import { addCalendarDays, formatEasternDate } from "./submission-date-range";

export async function syncGoogleLsaWindow(from: string, to: string) {
  if (!validateGoogleAdsWindow(from, to)) throw new Error("Choose a valid date range of at most 366 days.");
  const customerId = (process.env.GOOGLE_LSA_CUSTOMER_ID || process.env.GOOGLE_ADS_CUSTOMER_ID || "").replace(/-/g, "");
  const through = [to, addCalendarDays(formatEasternDate(new Date()), -1)!].sort()[0];
  const account = await googleAdsQuery<{ customer: { currencyCode: string; timeZone: string } }>("SELECT customer.currency_code, customer.time_zone FROM customer", customerId);
  if (account[0]?.customer.currencyCode !== "USD" || account[0]?.customer.timeZone !== "America/New_York") {
    throw new Error("LSA reporting requires a USD account using America/New_York dates.");
  }
  const discovered = await googleAdsQuery<LsaCampaignRow>("SELECT campaign.id, campaign.name, campaign.advertising_channel_type, campaign.pmax_campaign_settings.local_services_enabled FROM campaign", customerId);
  const campaigns = discovered.filter(isLsaCampaign);
  if (!campaigns.length) throw new Error("No Local Services campaigns were found in the connected Google account. Configure GOOGLE_LSA_CUSTOMER_ID for the LSA account and grant the Google Ads service account access.");
  const assignments = await prisma.googleAdsCampaignBusiness.findMany({ where: { campaignId: { in: campaigns.map(row => row.campaign!.id!) } } });
  const byId = new Map(assignments.map(row => [row.campaignId, row.business]));
  const unassigned = campaigns.filter(row => !byId.get(row.campaign!.id!)).map(row => ({ id: row.campaign!.id!, name: row.campaign!.name ?? row.campaign!.id!, business: null }));
  if (unassigned.length) return { synced: false, campaigns: unassigned, error: "Assign the LSA campaigns below, then update Google LSA again." };
  const ids = campaigns.map(row => row.campaign!.id!);
  if (ids.some(id => !/^\d+$/.test(id))) throw new Error("Google returned an invalid campaign ID.");
  const [spend, leads] = await Promise.all([
    googleAdsQuery<LsaCampaignRow>(`SELECT campaign.id, metrics.cost_micros FROM campaign WHERE campaign.id IN (${ids.join(",")}) AND segments.date BETWEEN '${from}' AND '${through}'`, customerId),
    googleAdsQuery<LsaLeadRow>(`SELECT local_services_lead.resource_name, local_services_lead.campaign, local_services_lead.lead_type, local_services_lead.creation_date_time, local_services_lead.contact_details, local_services_lead.service_id, local_services_lead.lead_charged, local_services_lead.credit_details.credit_state FROM local_services_lead WHERE local_services_lead.lead_type = 'PHONE_CALL' AND local_services_lead.creation_date_time >= '${from} 00:00:00' AND local_services_lead.creation_date_time <= '${through} 23:59:59'`, customerId),
  ]);
  // Validate all leads before replacing any saved data, including excluded campaigns.
  normalizeLsaCalls(leads, new Set(ids), from, through);
  const start = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
  const snapshots = ["pet-resort", "mobile-grooming"].map(business => {
    const selectedIds = new Set(ids.filter(id => byId.get(id) === business));
    const calls = normalizeLsaCalls(leads.filter(row => selectedIds.has(row.localServicesLead?.campaign?.split("/").at(-1) ?? "")), selectedIds, from, through);
    return { business, customerId, spendCents: lsaSpendCents(spend.filter(row => selectedIds.has(row.campaign?.id ?? ""))), calls, syncedAt: new Date() };
  });
  await prisma.$transaction(snapshots.map(data => prisma.googleLsaSyncWindow.upsert({
    where: { business_from_to: { business: data.business, from: start, to: end } },
    create: { ...data, from: start, to: end }, update: data,
  })));
  return { synced: true, calls: snapshots.reduce((sum, row) => sum + row.calls.length, 0), spendCents: snapshots.reduce((sum, row) => sum + row.spendCents, 0) };
}
