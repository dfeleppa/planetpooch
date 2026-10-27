import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { assignLeadOutcomes, leadOutcomeWindow, matchingOutcomeCustomerIds, type OutcomeCustomerProfile } from "@/lib/marketing/lead-outcomes";
import { attributionText, classifyLeadAttribution, type LeadAttributionSource, type SubmissionAttribution } from "@/lib/marketing/lead-attribution";
import { normalizedPhone } from "@/lib/marketing/moego-client-history";
import { Prisma } from "@prisma/client";
import type { ReportSource } from "./report-range";
import { resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";

export async function loadLeadOutcomes({ from, to, source }: { from: string; to: string; source: ReportSource }) {
  const { startAt: since, endBefore: until } = resolveSubmissionDateRange(from, to);
  const { staleBefore } = leadOutcomeWindow(1);
  const [session, submissions, appointmentSync, orderSync, latestOrder, latestCustomer] = await Promise.all([
    getSession(),
    prisma.websiteFormSubmission.findMany({
      where: { company: { in: ["RESORT", "GROOMING"] }, status: "SYNCED", moegoCustomerId: { not: null }, receivedAt: { gte: since, lt: until } },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
      take: 500,
      select: { id: true, company: true, receivedAt: true, firstName: true, lastName: true, phone: true, email: true, moegoCustomerId: true, services: true, attribution: true },
    }),
    prisma.moegoSyncState.findUnique({ where: { resource: "appointment" } }),
    prisma.moegoSyncState.findUnique({ where: { resource: "order" } }),
    prisma.moegoOrder.aggregate({ _max: { syncedAt: true } }),
    prisma.moegoCustomer.aggregate({ _max: { syncedAt: true } }),
  ]);
  const rows = source === "all" ? submissions : submissions.filter((row) => {
    const attribution = row.attribution && typeof row.attribution === "object" && !Array.isArray(row.attribution)
      ? row.attribution as SubmissionAttribution : {};
    return classifyLeadAttribution(attribution) === source;
  });
  const phones = [...new Set(rows.map((row) => normalizedPhone(row.phone)).filter((phone): phone is string => phone !== null))];
  const profiles = phones.length ? await prisma.$queryRaw<OutcomeCustomerProfile[]>(Prisma.sql`
    SELECT "moegoId", "name", "email", "mainPhoneNumber"
    FROM "MoegoCustomer"
    WHERE RIGHT(REGEXP_REPLACE(COALESCE("mainPhoneNumber", ''), '[^0-9]', '', 'g'), 10)
      IN (${Prisma.join(phones)})
  `) : [];
  const profilesByPhone = new Map<string, OutcomeCustomerProfile[]>();
  for (const profile of profiles) {
    const phone = normalizedPhone(profile.mainPhoneNumber);
    if (!phone) continue;
    const group = profilesByPhone.get(phone) ?? [];
    group.push(profile);
    profilesByPhone.set(phone, group);
  }
  const matchedRows = rows.map((row) => ({
    row,
    ids: matchingOutcomeCustomerIds({
      moegoCustomerId: row.moegoCustomerId!, phone: row.phone,
      firstName: row.firstName, lastName: row.lastName, email: row.email,
    }, profilesByPhone.get(normalizedPhone(row.phone) ?? "") ?? []),
  }));
  const customerIds = [...new Set(matchedRows.flatMap(({ ids }) => [...ids]))];
  const [appointments, orders] = await Promise.all([
    appointmentSync && customerIds.length ? prisma.moegoAppointment.findMany({
      where: { customerMoegoId: { in: customerIds }, createdTime: { gte: since } },
      select: { id: true, customerMoegoId: true, createdTime: true, status: true, isDeleted: true, noShow: true },
    }) : Promise.resolve([]),
    orderSync && customerIds.length ? prisma.moegoOrder.findMany({
      where: { customerMoegoId: { in: customerIds } },
      select: { id: true, customerMoegoId: true, status: true, createdTime: true, salesDatetime: true, completedTime: true, paidCents: true, refundedCents: true },
    }) : Promise.resolve([]),
  ]);
  const assigned = assignLeadOutcomes(matchedRows.map(({ row, ids }) => ({
    id: row.id, receivedAt: row.receivedAt, customerIds: ids,
  })), appointments, orders);
  const outcomes = matchedRows.map(({ row, ids }) => ({
    ...row,
    profileCount: ids.size,
    result: assigned.get(row.id)!,
  }));
  const uniqueOutcomes = new Map<string, typeof outcomes[number]>();
  for (const outcome of outcomes) {
    uniqueOutcomes.set(outcome.moegoCustomerId!, outcome);
  }
  const totalBooked = outcomes.reduce((sum, row) => sum + row.result.booked, 0);
  const totalNetPaidCents = outcomes.reduce((sum, row) => sum + row.result.netPaidCents, 0);
  const duplicateProfileLeads = outcomes.filter((row) => row.profileCount > 1).length;
  const attributedOutcomes = outcomes.map((row) => {
    const attribution = row.attribution && typeof row.attribution === "object" && !Array.isArray(row.attribution)
      ? row.attribution as SubmissionAttribution : {};
    const source = classifyLeadAttribution(attribution);
    return { ...row, source, campaignId: source === "unattributed" ? null : attributionText(attribution, "utm_campaign") };
  });
  const metaCampaignIds = [...new Set(attributedOutcomes.filter((row) => row.source === "meta").flatMap((row) => row.campaignId ? [row.campaignId] : []))];
  const googleCampaignIds = [...new Set(attributedOutcomes.filter((row) => row.source === "google-ads").flatMap((row) => row.campaignId ? [row.campaignId] : []))];
  const [metaCampaigns, googleCampaigns] = await Promise.all([
    metaCampaignIds.length ? prisma.metaAdInsight.findMany({
      where: { campaignId: { in: metaCampaignIds } }, orderBy: { date: "desc" },
      select: { campaignId: true, campaignName: true },
    }) : Promise.resolve([]),
    googleCampaignIds.length ? prisma.financeGoogleCampaignReportRow.findMany({
      where: { campaignId: { in: googleCampaignIds }, business: { in: ["pet-resort", "pet-resort-manual", "mobile-grooming", "mobile-grooming-manual", "all-businesses", "all-businesses-manual"] } },
      orderBy: { updatedAt: "desc" }, select: { campaignId: true, campaign: true },
    }) : Promise.resolve([]),
  ]);
  const campaignNames = new Map<string, string>();
  for (const campaign of metaCampaigns) {
    if (campaign.campaignId && campaign.campaignName && !campaignNames.has(`meta|${campaign.campaignId}`)) campaignNames.set(`meta|${campaign.campaignId}`, campaign.campaignName);
  }
  for (const campaign of googleCampaigns) {
    if (campaign.campaignId && !campaignNames.has(`google-ads|${campaign.campaignId}`)) campaignNames.set(`google-ads|${campaign.campaignId}`, campaign.campaign);
  }
  type CampaignGroup = { source: LeadAttributionSource; campaignId: string | null; campaignName: string; leads: number; bookedLeads: number; appointments: number; netPaidCents: number };
  const campaignGroups = new Map<string, CampaignGroup>();
  for (const outcome of attributedOutcomes) {
    const key = `${outcome.source}|${outcome.campaignId ?? ""}`;
    let group = campaignGroups.get(key);
    if (!group) {
      group = {
        source: outcome.source, campaignId: outcome.campaignId,
        campaignName: outcome.source === "unattributed" ? "Unattributed" : outcome.campaignId
          ? campaignNames.get(`${outcome.source}|${outcome.campaignId}`) ?? outcome.campaignId : "Campaign not supplied",
        leads: 0, bookedLeads: 0, appointments: 0, netPaidCents: 0,
      };
      campaignGroups.set(key, group);
    }
    group.leads++;
    if (outcome.result.booked > 0) group.bookedLeads++;
    group.appointments += outcome.result.booked;
    group.netPaidCents += outcome.result.netPaidCents;
  }
  const campaignRows = [...campaignGroups.values()].sort((a, b) =>
    b.netPaidCents - a.netPaidCents || b.appointments - a.appointments || b.leads - a.leads || a.campaignName.localeCompare(b.campaignName));
  const totalBookedLeads = outcomes.filter((row) => row.result.booked > 0).length;
  const isAdmin = ["SUPER_ADMIN"].includes(session?.user?.role ?? "");
  // The general MoeGo sync can advance its order cursor when API permission is
  // denied, so a cursor alone cannot establish that paid totals are current.
  const orderDataAvailable = Boolean(orderSync && latestOrder._max.syncedAt && latestOrder._max.syncedAt >= staleBefore);
  const incomplete = Boolean(!latestCustomer._max.syncedAt || latestCustomer._max.syncedAt < staleBefore ||
    (appointmentSync && appointmentSync.lastSyncedAt < staleBefore) ||
    (orderSync && orderSync.lastSyncedAt < staleBefore) || (orderSync && !orderDataAvailable));

  return {
    campaigns: campaignRows,
    leads: attributedOutcomes.map((row) => ({
      id: row.id,
      receivedAt: row.receivedAt.toISOString(),
      customer: [row.firstName, row.lastName].filter(Boolean).join(" ") || row.moegoCustomerId!,
      business: row.company === "RESORT" ? "Pet Resort" : "Mobile Grooming",
      source: row.source,
      campaignId: row.campaignId,
      campaignName: row.campaignId ? campaignNames.get(`${row.source}|${row.campaignId}`) ?? row.campaignId : null,
      services: row.services,
      profileCount: row.profileCount,
      booked: row.result.booked,
      pending: row.result.pending,
      firstBookedAt: row.result.firstBookedAt?.toISOString() ?? null,
      netPaidCents: row.result.netPaidCents,
    })),
    isAdmin,
    linkedSubmissions: outcomes.length,
    linkedCustomers: uniqueOutcomes.size,
    duplicateProfileLeads,
    totalBookedLeads,
    totalBooked,
    totalNetPaidCents,
    appointmentsAvailable: Boolean(appointmentSync),
    orderDataAvailable,
    incomplete,
    appointmentSyncedAt: appointmentSync?.lastSyncedAt.toISOString() ?? null,
    appointmentUpdatedAt: appointmentSync?.updatedAt.toISOString() ?? null,
    orderSyncedAt: orderSync?.lastSyncedAt.toISOString() ?? null,
  };
}
