import { classifyLeadAttribution, type LeadAttributionSource, type SubmissionAttribution } from "./lead-attribution";

export type PaidOrder = {
  customerMoegoId: string | null;
  createdTime: Date;
  salesDatetime: Date | null;
  completedTime: Date | null;
  paidCents: number;
  refundedCents: number;
};

export type LinkedSubmission = {
  moegoCustomerId: string | null;
  receivedAt: Date;
  attribution: unknown;
};

export function orderSaleDate(order: PaidOrder): Date {
  return order.salesDatetime ?? order.completedTime ?? order.createdTime;
}

/** A paid order belongs to the latest recorded form for that customer before the sale. */
export function allocatePaidOrders(orders: PaidOrder[], submissions: LinkedSubmission[]) {
  const totals: Record<LeadAttributionSource, number> = {
    meta: 0,
    "google-ads": 0,
    "google-lsa": 0,
    unattributed: 0,
  };
  const formsByCustomer = new Map<string, LinkedSubmission[]>();
  for (const form of submissions) {
    if (!form.moegoCustomerId) continue;
    const forms = formsByCustomer.get(form.moegoCustomerId) ?? [];
    forms.push(form);
    formsByCustomer.set(form.moegoCustomerId, forms);
  }
  for (const forms of formsByCustomer.values()) {
    forms.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());
  }

  for (const order of orders) {
    const saleAt = orderSaleDate(order);
    const form = order.customerMoegoId
      ? formsByCustomer.get(order.customerMoegoId)?.find((candidate) => candidate.receivedAt <= saleAt)
      : undefined;
    const attribution = form?.attribution;
    const source = attribution && typeof attribution === "object" && !Array.isArray(attribution)
      ? classifyLeadAttribution(attribution as SubmissionAttribution)
      : "unattributed";
    totals[source] += order.paidCents - order.refundedCents;
  }
  return totals;
}
