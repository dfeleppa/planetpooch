import { normalizedPhone } from "./moego-client-history";

export type LeadIdentity = {
  moegoCustomerId: string;
  phone: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

export type OutcomeCustomerProfile = {
  moegoId: string;
  mainPhoneNumber: string | null;
  name: string | null;
  email: string | null;
};

export type AppointmentOutcome = {
  customerMoegoId: string | null;
  createdTime: Date | null;
  status: string | null;
  isDeleted: boolean;
  noShow: boolean;
};

export type OrderOutcome = {
  customerMoegoId: string | null;
  status: string | null;
  createdTime: Date;
  salesDatetime: Date | null;
  completedTime: Date | null;
  paidCents: number;
  refundedCents: number;
};

const BOOKED = new Set(["CONFIRMED", "CHECKED_IN", "READY", "FINISHED"]);
const REVENUE = new Set(["PROCESSING", "COMPLETED"]);

function normalizedName(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]/gu, "");
}

/** A duplicate MoeGo profile needs the same phone plus exact name or email. */
export function matchingOutcomeCustomerIds(
  lead: LeadIdentity,
  profiles: OutcomeCustomerProfile[],
): Set<string> {
  const ids = new Set([lead.moegoCustomerId]);
  const phone = normalizedPhone(lead.phone);
  if (!phone) return ids;
  const fullName = lead.firstName?.trim() && lead.lastName?.trim()
    ? normalizedName(`${lead.firstName} ${lead.lastName}`) : null;
  const email = lead.email?.trim().toLocaleLowerCase("en-US") || null;
  for (const profile of profiles) {
    if (normalizedPhone(profile.mainPhoneNumber) !== phone) continue;
    const sameName = Boolean(fullName && profile.name && normalizedName(profile.name) === fullName);
    const sameEmail = Boolean(email && profile.email?.trim().toLocaleLowerCase("en-US") === email);
    if (sameName || sameEmail) ids.add(profile.moegoId);
  }
  return ids;
}

export function leadOutcomeWindow(days: number) {
  const now = Date.now();
  return {
    since: new Date(now - days * 24 * 60 * 60 * 1000),
    staleBefore: new Date(now - 24 * 60 * 60 * 1000),
  };
}

/** Count post-submission outcomes on the linked and verified duplicate profiles. */
export function summarizeLeadOutcome(
  customerIds: ReadonlySet<string>,
  receivedAt: Date,
  appointments: AppointmentOutcome[],
  orders: OrderOutcome[],
) {
  let booked = 0;
  let pending = 0;
  let firstBookedAt: Date | null = null;
  for (const appointment of appointments) {
    if (!appointment.customerMoegoId || !customerIds.has(appointment.customerMoegoId) || appointment.isDeleted || appointment.noShow ||
        !appointment.createdTime || appointment.createdTime < receivedAt) continue;
    if (appointment.status === "UNCONFIRMED") pending++;
    if (BOOKED.has(appointment.status ?? "")) {
      booked++;
      if (!firstBookedAt || appointment.createdTime < firstBookedAt) firstBookedAt = appointment.createdTime;
    }
  }

  let paidCents = 0;
  let refundedCents = 0;
  for (const order of orders) {
    if (!order.customerMoegoId || !customerIds.has(order.customerMoegoId) || !REVENUE.has(order.status ?? "")) continue;
    const saleAt = order.salesDatetime ?? order.completedTime ?? order.createdTime;
    if (saleAt < receivedAt) continue;
    paidCents += order.paidCents;
    refundedCents += order.refundedCents;
  }
  return { booked, pending, firstBookedAt, netPaidCents: paidCents - refundedCents };
}
