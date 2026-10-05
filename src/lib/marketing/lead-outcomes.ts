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

export function leadOutcomeWindow(days: number) {
  const now = Date.now();
  return {
    since: new Date(now - days * 24 * 60 * 60 * 1000),
    staleBefore: new Date(now - 24 * 60 * 60 * 1000),
  };
}

/** Exact MoeGo customer ID only; phone and campaign proximity are not proof. */
export function summarizeLeadOutcome(
  customerId: string,
  receivedAt: Date,
  appointments: AppointmentOutcome[],
  orders: OrderOutcome[],
) {
  let booked = 0;
  let pending = 0;
  let firstBookedAt: Date | null = null;
  for (const appointment of appointments) {
    if (appointment.customerMoegoId !== customerId || appointment.isDeleted || appointment.noShow ||
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
    if (order.customerMoegoId !== customerId || !REVENUE.has(order.status ?? "")) continue;
    const saleAt = order.salesDatetime ?? order.completedTime ?? order.createdTime;
    if (saleAt < receivedAt) continue;
    paidCents += order.paidCents;
    refundedCents += order.refundedCents;
  }
  return { booked, pending, firstBookedAt, netPaidCents: paidCents - refundedCents };
}
