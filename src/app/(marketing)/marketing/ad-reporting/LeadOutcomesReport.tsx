import { getSession } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { assignLeadOutcomes, leadOutcomeWindow, matchingOutcomeCustomerIds, type OutcomeCustomerProfile } from "@/lib/marketing/lead-outcomes";
import { attributionText, classifyLeadAttribution, type LeadAttributionSource, type SubmissionAttribution } from "@/lib/marketing/lead-attribution";
import { normalizedPhone } from "@/lib/marketing/moego-client-history";
import { Prisma } from "@prisma/client";
import { SyncLeadOutcomesButton } from "./SyncLeadOutcomesButton";
import type { ReportSource } from "./report-range";
import { resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const eastern = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium" });
const SOURCE_LABELS: Record<LeadAttributionSource, string> = {
  meta: "Meta", "google-ads": "Google Ads", "google-lsa": "Google LSA", unattributed: "Unattributed",
};

export async function LeadOutcomesReport({ from, to, source }: { from: string; to: string; source: ReportSource }) {
  const { startAt: since, endBefore: until } = resolveSubmissionDateRange(from, to);
  const { staleBefore } = leadOutcomeWindow(1);
  const business = await getActiveBusiness();
  const [session, submissions, appointmentSync, orderSync, latestOrder, latestCustomer] = await Promise.all([
    getSession(),
    prisma.websiteFormSubmission.findMany({
      where: { company: business.company, status: "SYNCED", moegoCustomerId: { not: null }, receivedAt: { gte: since, lt: until } },
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
      where: { campaignId: { in: googleCampaignIds }, business: { in: [business.key, `${business.key}-manual`, "all-businesses", "all-businesses-manual"] } },
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
  const isAdmin = ["SUPER_ADMIN", "ADMIN"].includes(session?.user?.role ?? "");
  // The general MoeGo sync can advance its order cursor when API permission is
  // denied, so a cursor alone cannot establish that paid totals are current.
  const orderDataAvailable = Boolean(orderSync && latestOrder._max.syncedAt && latestOrder._max.syncedAt >= staleBefore);
  const incomplete = Boolean(!latestCustomer._max.syncedAt || latestCustomer._max.syncedAt < staleBefore ||
    (appointmentSync && appointmentSync.lastSyncedAt < staleBefore) ||
    (orderSync && orderSync.lastSyncedAt < staleBefore) || (orderSync && !orderDataAvailable));

  return <div>
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm text-gray-600">Only website submissions linked to a MoeGo customer appear here. Confirmed bookings and net paid are observed after each form; they are not proof that an ad caused the purchase.</p>
      </div>
      {isAdmin && <SyncLeadOutcomesButton />}
    </div>
    <div className="mb-4 grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Linked customers</p><p className="mt-1 text-2xl font-semibold">{uniqueOutcomes.size}</p></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Confirmed bookings</p><p className="mt-1 text-2xl font-semibold">{appointmentSync ? totalBooked : "—"}</p></div>
      <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-xs text-gray-500">Net paid after form</p><p className="mt-1 text-2xl font-semibold">{orderDataAvailable ? money(totalNetPaidCents) : "—"}</p></div>
    </div>
    <p className="mb-4 text-sm text-gray-600">
      {rows.length} linked submissions shown{rows.length === 500 ? " (first 500 only)" : ""}; {duplicateProfileLeads} include verified duplicate MoeGo profiles.
      {appointmentSync ? ` Appointments synced through ${eastern.format(appointmentSync.lastSyncedAt)}.` : " Appointment sync has not run yet."}
      {orderSync ? ` Order cursor through ${eastern.format(orderSync.lastSyncedAt)}.` : " Order sync has not run yet."}
      {!orderDataAvailable && " Recent order data is unavailable; paid totals are hidden."}
      {incomplete && " Counts may be incomplete while a sync is behind."}
    </p>
    <div className="mb-6 overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <div className="border-b border-gray-100 px-4 py-3">
        <h4 className="font-semibold text-gray-900">Leads, appointments, and paid revenue by campaign</h4>
        <p className="mt-1 text-xs text-gray-500">Successful MoeGo-linked forms received in the selected period. Outcomes after each form are assigned to its captured campaign; repeat forms receive each appointment or order once, at the latest prior submission. Unattributed leads remain visible.</p>
      </div>
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-gray-50 text-gray-700"><tr>
          {["Source", "Campaign", "Leads", "Booked leads", "Appointments", "Net paid after form"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
        </tr></thead>
        <tbody>
          {campaignRows.map((row) => <tr key={`${row.source}|${row.campaignId ?? ""}`} className="border-t border-gray-100">
            <td className="px-4 py-3">{SOURCE_LABELS[row.source]}</td>
            <td className="max-w-72 break-words px-4 py-3">{row.campaignName}{row.campaignId && row.campaignId !== row.campaignName && <div className="text-xs text-gray-500">ID: {row.campaignId}</div>}</td>
            <td className="px-4 py-3 tabular-nums">{row.leads}</td>
            <td className="px-4 py-3 tabular-nums">{appointmentSync ? row.bookedLeads : "—"}</td>
            <td className="px-4 py-3 tabular-nums">{appointmentSync ? row.appointments : "—"}</td>
            <td className="px-4 py-3 tabular-nums">{orderDataAvailable ? money(row.netPaidCents) : "—"}</td>
          </tr>)}
          {campaignRows.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No linked website leads in this period.</td></tr>}
          {campaignRows.length > 0 && <tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-900">
            <td className="px-4 py-3" colSpan={2}>Total</td>
            <td className="px-4 py-3 tabular-nums">{outcomes.length}</td>
            <td className="px-4 py-3 tabular-nums">{appointmentSync ? totalBookedLeads : "—"}</td>
            <td className="px-4 py-3 tabular-nums">{appointmentSync ? totalBooked : "—"}</td>
            <td className="px-4 py-3 tabular-nums">{orderDataAvailable ? money(totalNetPaidCents) : "—"}</td>
          </tr>}
        </tbody>
      </table>
    </div>
    <details className="rounded-xl border border-gray-200 bg-white">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-800">Show individual linked leads ({outcomes.length})</summary>
      <div className="overflow-x-auto border-t border-gray-100">
      <table className="w-full min-w-[1000px] text-left text-sm">
        <thead className="bg-gray-50 text-gray-700"><tr>
          {["Submitted", "Customer", "Source", "Campaign", "Services", "MoeGo profiles", "Booked", "Pending", "First booked", "Net paid after form"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}
        </tr></thead>
        <tbody>{attributedOutcomes.map((row) => <tr key={row.id} className="border-t border-gray-100 align-top">
          <td className="whitespace-nowrap px-4 py-3">{eastern.format(row.receivedAt)}</td>
          <td className="px-4 py-3">{[row.firstName, row.lastName].filter(Boolean).join(" ") || row.moegoCustomerId}</td>
          <td className="px-4 py-3">{SOURCE_LABELS[row.source]}</td>
          <td className="max-w-56 break-words px-4 py-3">{row.source === "unattributed" ? "—" : row.campaignId ? campaignNames.get(`${row.source}|${row.campaignId}`) ?? row.campaignId : "—"}</td>
          <td className="px-4 py-3">{row.services.join(", ") || "—"}</td>
          <td className="px-4 py-3 tabular-nums">{row.profileCount}</td>
          <td className="px-4 py-3 tabular-nums">{appointmentSync ? row.result.booked : "—"}</td>
          <td className="px-4 py-3 tabular-nums">{appointmentSync ? row.result.pending : "—"}</td>
          <td className="whitespace-nowrap px-4 py-3">{appointmentSync && row.result.firstBookedAt ? eastern.format(row.result.firstBookedAt) : "—"}</td>
          <td className="whitespace-nowrap px-4 py-3 tabular-nums">{orderDataAvailable ? money(row.result.netPaidCents) : "—"}</td>
        </tr>)}
        {outcomes.length === 0 && <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-500">No linked website submissions in this range.</td></tr>}
        </tbody>
      </table>
      </div>
    </details>
    <p className="mt-3 text-xs text-gray-500">Duplicate profiles require the same phone and exact name or email; a shared phone alone is excluded. These are observed customer outcomes, not proof that an ad caused them. Unconfirmed appointments appear under Pending. Canceled, deleted, and no-show appointments are excluded.</p>
  </div>;
}
