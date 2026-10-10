import { prisma } from "@/lib/prisma";
import { BUSINESSES } from "@/lib/business";
import { getActiveBusiness } from "@/lib/business-server";
import { reportPeriod } from "@/lib/knowledge-report-period";
import { resolveSubmissionDateRange } from "@/lib/marketing/submission-date-range";
import type { KnowledgeSource } from "@/lib/knowledge";

type Lead = { moegoCustomerId: string | null; receivedAt: Date };
type Appointment = { customerMoegoId: string | null; createdTime: Date | null; startTime: Date | null;
  status: string | null; isDeleted: boolean; noShow: boolean };

/** Customer cohort, not form conversion: repeated forms and appointments count once. */
export function funnelCohort(leads: Lead[], appointments: Appointment[], asOf: Date) {
  const first = new Map<string, Date>();
  for (const lead of leads) if (lead.moegoCustomerId && (!first.has(lead.moegoCustomerId)
    || lead.receivedAt < first.get(lead.moegoCustomerId)!)) first.set(lead.moegoCustomerId, lead.receivedAt);
  const booked = new Set<string>();
  const completed = new Set<string>();
  for (const appointment of appointments) {
    const id = appointment.customerMoegoId;
    if (!id || !first.has(id) || !appointment.createdTime || appointment.createdTime < first.get(id)!
      || appointment.createdTime > asOf || appointment.isDeleted || appointment.noShow) continue;
    if (["CONFIRMED", "CHECKED_IN", "READY", "FINISHED"].includes(appointment.status ?? "")) booked.add(id);
    if (appointment.status === "FINISHED" && appointment.startTime && appointment.startTime <= asOf) completed.add(id);
  }
  return { linkedCustomers: first.size, booked: booked.size, completed: completed.size };
}

export async function findFunnelEvidence(question: string): Promise<KnowledgeSource[]> {
  const active = await getActiveBusiness();
  const combined = /both businesses|all businesses|combined|company[ -]?wide/i.test(question);
  const businesses = combined ? [...BUSINESSES] : [/mobile[ -]?grooming/i.test(question) ? BUSINESSES[1]
    : /pet[ -]?resort/i.test(question) ? BUSINESSES[0] : active];
  const period = reportPeriod(question);
  const now = new Date();
  const range = resolveSubmissionDateRange(period?.start, period?.end, now);
  // Keep the business cohorts separate: an appointment in another business is not a conversion here.
  return Promise.all(businesses.map(async (business) => {
    const where = { company: business.company, receivedAt: { gte: range.startAt, lt: range.endBefore } };
    const [total, leads, sync] = await Promise.all([
      prisma.websiteFormSubmission.count({ where }),
      prisma.websiteFormSubmission.findMany({ where, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take: 1001,
        select: { moegoCustomerId: true, receivedAt: true } }),
      prisma.moegoSyncState.findUnique({ where: { resource: "appointment" }, select: { lastSyncedAt: true } }),
    ]);
    const ids = [...new Set(leads.flatMap((lead) => lead.moegoCustomerId ? [lead.moegoCustomerId] : []))];
    const appointments = leads.length <= 1000 && ids.length && sync ? await prisma.moegoAppointment.findMany({
      where: { customerMoegoId: { in: ids }, businessId: business.moegoId, createdTime: { gte: range.startAt, lte: now } },
      take: 5001, orderBy: [{ createdTime: "asc" }, { moegoId: "asc" }],
      select: { customerMoegoId: true, createdTime: true, startTime: true, status: true, isDeleted: true, noShow: true },
    }) : [];
    const capped = leads.length > 1000 || appointments.length > 5000;
    const cohort = funnelCohort(leads, appointments, now);
    return { id: `record:funnel:${business.company}:${range.start}:${range.end}`, title: `${business.label} website inquiry cohort`,
      kind: "record", url: `/marketing/website-attribution/new-form-submissions?submissionStart=${range.start}&submissionEnd=${range.end}`,
      updatedAt: now.toISOString(), dateKind: "entry",
      excerpt: [
        `${business.label}. Saved website form attempts received ${range.start} through ${range.end} (Eastern): ${total}, across all statuses. ${period ? "" : "Default cohort: last 30 calendar days including today; today may be incomplete."}`,
        capped ? "Cohort exceeds the 1,000-form or 5,000-appointment analysis limit. Outcome counts and conversion rates withheld; request a shorter date range."
          : `${leads.filter((lead) => lead.moegoCustomerId).length} forms have a direct saved customer link, representing ${cohort.linkedCustomers} distinct linked customers. Repeat forms count once per customer. ${total - leads.filter((lead) => lead.moegoCustomerId).length} forms lack a direct customer link.`,
        !sync ? "No appointment sync watermark is available; booking and completion outcomes cannot be verified."
          : capped ? "" : `Among those ${cohort.linkedCustomers} linked customers, ${cohort.booked} have a saved, non-deleted, non-no-show appointment created after their first form in this cohort with current status CONFIRMED, CHECKED_IN, READY or FINISHED. ${cohort.completed} have a FINISHED appointment whose service start is no later than the analysis time. Outcomes may occur after the form date range.`,
        `Appointment sync watermark: ${sync?.lastSyncedAt.toISOString() ?? "unavailable"}; analysis time ${now.toISOString()}. A watermark does not prove complete historical coverage.`,
        "This is an observed directly linked customer cohort, not a complete form-to-booking conversion rate. Duplicate customer identities are not merged. Unlinked forms and missing appointments are unknown outcomes, not lost customers. Cancelled/no-show appointments are excluded from the current booked measure, so it is not an ever-booked count. Recent leads have had less time to convert. No matched anonymous visitor cohort, response-time events, service filter or payment/profit evidence is provided. Do not divide whole-business orders by form counts, infer causality, or rank drop-off across incomparable stages.",
      ].filter(Boolean).join("\n") } satisfies KnowledgeSource;
  }));
}
