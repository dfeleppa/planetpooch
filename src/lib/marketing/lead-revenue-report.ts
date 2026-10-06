import { Prisma, type Company } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { classifyLeadAttribution, type LeadAttributionSource, type SubmissionAttribution } from "./lead-attribution";
import { assignLeadOutcomes, matchingOutcomeCustomerIds, type OutcomeCustomerProfile } from "./lead-outcomes";
import { normalizedPhone } from "./moego-client-history";
import { resolveSubmissionDateRange } from "./submission-date-range";

/** Match the linked lead and post-form paid totals displayed in section 3. */
export async function leadRevenueBySource(companies: Company[], from: string, to: string, source: LeadAttributionSource | "all") {
  const { startAt, endBefore } = resolveSubmissionDateRange(from, to);
  const submissions = await prisma.websiteFormSubmission.findMany({
    where: { company: { in: companies }, status: "SYNCED", moegoCustomerId: { not: null }, receivedAt: { gte: startAt, lt: endBefore } },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: 500,
    select: { id: true, receivedAt: true, firstName: true, lastName: true, phone: true, email: true, moegoCustomerId: true, attribution: true },
  });
  const rows = source === "all" ? submissions : submissions.filter((row) =>
    classifyLeadAttribution(row.attribution && typeof row.attribution === "object" && !Array.isArray(row.attribution)
      ? row.attribution as SubmissionAttribution : {}) === source);
  const phones = [...new Set(rows.map((row) => normalizedPhone(row.phone)).filter((phone): phone is string => phone !== null))];
  const profiles = phones.length ? await prisma.$queryRaw<OutcomeCustomerProfile[]>(Prisma.sql`
    SELECT "moegoId", "name", "email", "mainPhoneNumber" FROM "MoegoCustomer"
    WHERE RIGHT(REGEXP_REPLACE(COALESCE("mainPhoneNumber", ''), '[^0-9]', '', 'g'), 10)
      IN (${Prisma.join(phones)})
  `) : [];
  const profilesByPhone = new Map<string, OutcomeCustomerProfile[]>();
  for (const profile of profiles) {
    const phone = normalizedPhone(profile.mainPhoneNumber);
    if (phone) profilesByPhone.set(phone, [...(profilesByPhone.get(phone) ?? []), profile]);
  }
  const matched = rows.map((row) => ({ row, ids: matchingOutcomeCustomerIds({
    moegoCustomerId: row.moegoCustomerId!, phone: row.phone, firstName: row.firstName,
    lastName: row.lastName, email: row.email,
  }, profilesByPhone.get(normalizedPhone(row.phone) ?? "") ?? []) }));
  const customerIds = [...new Set(matched.flatMap(({ ids }) => [...ids]))];
  const orders = customerIds.length ? await prisma.moegoOrder.findMany({
    where: { customerMoegoId: { in: customerIds } },
    select: { id: true, customerMoegoId: true, status: true, createdTime: true, salesDatetime: true, completedTime: true, paidCents: true, refundedCents: true },
  }) : [];
  const assigned = assignLeadOutcomes(matched.map(({ row, ids }) => ({ id: row.id, receivedAt: row.receivedAt, customerIds: ids })), [], orders);
  const totals: Record<LeadAttributionSource, number> = { meta: 0, "google-ads": 0, "google-lsa": 0, unattributed: 0 };
  for (const { row } of matched) {
    const attribution = row.attribution && typeof row.attribution === "object" && !Array.isArray(row.attribution)
      ? row.attribution as SubmissionAttribution : {};
    totals[classifyLeadAttribution(attribution)] += assigned.get(row.id)!.netPaidCents;
  }
  return { totals, limited: submissions.length === 500 };
}
