import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { lsaLeadDay } from "./google-lsa-leads";
import { normalizedPhone } from "./moego-client-history";

type Call = { id: string; leadReceived: string | null; customer: string | null };
type Profile = { moegoId: string; mainPhoneNumber: string | null };
type Appointment = {
  moegoId: string; customerMoegoId: string | null; createdTime: Date | null;
  status: string | null; isDeleted: boolean; noShow: boolean;
};
type Order = {
  moegoId: string; customerMoegoId: string | null; createdTime: Date;
  salesDatetime: Date | null; completedTime: Date | null; status: string | null;
  paidCents: number; refundedCents: number;
};

const BOOKED = new Set(["CONFIRMED", "CHECKED_IN", "READY", "FINISHED"]);
const PAID = new Set(["PROCESSING", "COMPLETED"]);
const easternDay = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});

export const lsaAppointmentBackfillResource = (from: string, to: string) =>
  `lsa-appointments:${from}:${to}`;

function eventDay(value: Date): string {
  const parts = Object.fromEntries(easternDay.formatToParts(value).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/**
 * A Google LSA CSV has call dates, not times. Attribute only events on later
 * New York calendar dates, and give each event to the latest qualifying call.
 * Shared-phone MoeGo profiles are linked but excluded from outcomes.
 */
export function summarizeGoogleLsaCallOutcomes(
  calls: Call[], profiles: Profile[], appointments: Appointment[], orders: Order[],
) {
  const byPhone = new Map<string, Profile[]>();
  for (const profile of profiles) {
    const phone = normalizedPhone(profile.mainPhoneNumber);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), profile]);
  }

  let linked = 0;
  let ambiguous = 0;
  const byCustomer = new Map<string, { id: string; day: string }[]>();
  for (const call of calls) {
    const matches = byPhone.get(normalizedPhone(call.customer) ?? "") ?? [];
    if (matches.length) linked++;
    if (matches.length > 1) ambiguous++;
    const day = lsaLeadDay(call.leadReceived);
    if (matches.length !== 1 || !day) continue;
    const customerId = matches[0].moegoId;
    byCustomer.set(customerId, [...(byCustomer.get(customerId) ?? []), { id: call.id, day }]);
  }
  for (const candidates of byCustomer.values()) {
    candidates.sort((a, b) => b.day.localeCompare(a.day) || b.id.localeCompare(a.id));
  }

  const owner = (customerId: string | null, at: Date | null) => {
    if (!customerId || !at) return null;
    const day = eventDay(at);
    const latest = byCustomer.get(customerId)?.find((call) => call.day <= day);
    return latest && latest.day < day ? latest.id : null;
  };
  const booked = new Set<string>();
  const seenAppointments = new Set<string>();
  let appointmentCount = 0;
  for (const appointment of appointments) {
    if (seenAppointments.has(appointment.moegoId) || appointment.isDeleted || appointment.noShow ||
        !BOOKED.has(appointment.status ?? "")) continue;
    seenAppointments.add(appointment.moegoId);
    const callId = owner(appointment.customerMoegoId, appointment.createdTime);
    if (!callId) continue;
    booked.add(callId);
    appointmentCount++;
  }
  const seenOrders = new Set<string>();
  let netPaidCents = 0;
  for (const order of orders) {
    if (seenOrders.has(order.moegoId) || !PAID.has(order.status ?? "")) continue;
    seenOrders.add(order.moegoId);
    const callId = owner(order.customerMoegoId, order.salesDatetime ?? order.completedTime ?? order.createdTime);
    if (callId) netPaidCents += order.paidCents - order.refundedCents;
  }
  return { linked, ambiguous, bookedLeads: booked.size, appointments: appointmentCount, netPaidCents };
}

export async function getGoogleLsaCallOutcomes(calls: Call[]) {
  const phones = [...new Set(calls.map((call) => normalizedPhone(call.customer)).filter((phone): phone is string => Boolean(phone)))];
  if (!phones.length) return { ...summarizeGoogleLsaCallOutcomes(calls, [], [], []), matchedCustomers: 0 };
  const profiles = await prisma.$queryRaw<Profile[]>(Prisma.sql`
    SELECT "moegoId", "mainPhoneNumber" FROM "MoegoCustomer"
    WHERE RIGHT(REGEXP_REPLACE(COALESCE("mainPhoneNumber", ''), '[^0-9]', '', 'g'), 10)
      IN (${Prisma.join(phones)})
  `);
  const customerIds = profiles.map((profile) => profile.moegoId);
  const [appointments, orders] = await Promise.all([
    prisma.moegoAppointment.findMany({
      where: { customerMoegoId: { in: customerIds } },
      select: { moegoId: true, customerMoegoId: true, createdTime: true, status: true, isDeleted: true, noShow: true },
    }),
    prisma.moegoOrder.findMany({
      where: { customerMoegoId: { in: customerIds } },
      select: { moegoId: true, customerMoegoId: true, createdTime: true, salesDatetime: true, completedTime: true,
        status: true, paidCents: true, refundedCents: true },
    }),
  ]);
  return { ...summarizeGoogleLsaCallOutcomes(calls, profiles, appointments, orders), matchedCustomers: profiles.length };
}
