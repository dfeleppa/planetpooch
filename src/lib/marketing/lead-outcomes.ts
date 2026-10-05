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

export type OutcomeLead = {
  id: string;
  receivedAt: Date;
  customerIds: ReadonlySet<string>;
};

export type RecordedAppointment = AppointmentOutcome & { id: string };
export type RecordedOrder = OrderOutcome & { id: string };

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

/** Give each appointment and order to the latest qualifying form, once. */
export function assignLeadOutcomes(
  leads: OutcomeLead[],
  appointments: RecordedAppointment[],
  orders: RecordedOrder[],
) {
  const byCustomer = new Map<string, OutcomeLead[]>();
  const allocations = new Map(leads.map((lead) => [lead.id, {
    lead, appointments: [] as RecordedAppointment[], orders: [] as RecordedOrder[],
  }]));
  for (const lead of leads) {
    for (const customerId of lead.customerIds) {
      const candidates = byCustomer.get(customerId) ?? [];
      candidates.push(lead);
      byCustomer.set(customerId, candidates);
    }
  }
  for (const candidates of byCustomer.values()) {
    candidates.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || b.id.localeCompare(a.id));
  }
  const owner = (customerId: string | null, eventAt: Date | null) =>
    customerId && eventAt
      ? byCustomer.get(customerId)?.find((lead) => lead.receivedAt <= eventAt)
      : undefined;
  const seenAppointments = new Set<string>();
  for (const appointment of appointments) {
    if (seenAppointments.has(appointment.id)) continue;
    seenAppointments.add(appointment.id);
    const lead = owner(appointment.customerMoegoId, appointment.createdTime);
    if (lead) allocations.get(lead.id)!.appointments.push(appointment);
  }
  const seenOrders = new Set<string>();
  for (const order of orders) {
    if (seenOrders.has(order.id)) continue;
    seenOrders.add(order.id);
    const saleAt = order.salesDatetime ?? order.completedTime ?? order.createdTime;
    const lead = owner(order.customerMoegoId, saleAt);
    if (lead) allocations.get(lead.id)!.orders.push(order);
  }
  return new Map([...allocations].map(([id, allocation]) => [id, summarizeLeadOutcome(
    allocation.lead.customerIds,
    allocation.lead.receivedAt,
    allocation.appointments,
    allocation.orders,
  )]));
}
