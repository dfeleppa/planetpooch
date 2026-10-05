import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLeadOutcome, type AppointmentOutcome, type OrderOutcome } from "../src/lib/marketing/lead-outcomes";

const receivedAt = new Date("2026-10-01T12:00:00Z");
const appointment = (customerMoegoId: string, status: string, createdTime = "2026-10-02T12:00:00Z"): AppointmentOutcome => ({
  customerMoegoId, status, createdTime: new Date(createdTime), isDeleted: false, noShow: false,
});
const order = (customerMoegoId: string, paidCents: number, refundedCents: number, salesDatetime = "2026-10-03T12:00:00Z"): OrderOutcome => ({
  customerMoegoId, paidCents, refundedCents, salesDatetime: new Date(salesDatetime),
  status: "COMPLETED", createdTime: new Date(salesDatetime), completedTime: null,
});

test("counts only post-submission bookings and net paid for the exact customer", () => {
  const canceled = appointment("customer-1", "CANCELED");
  const noShow = { ...appointment("customer-1", "FINISHED"), noShow: true };
  const result = summarizeLeadOutcome("customer-1", receivedAt, [
    appointment("customer-1", "CONFIRMED"),
    appointment("customer-1", "UNCONFIRMED"),
    appointment("customer-1", "FINISHED", "2026-09-30T12:00:00Z"),
    appointment("customer-2", "CONFIRMED"), canceled, noShow,
  ], [
    order("customer-1", 10000, 1500),
    order("customer-1", 5000, 0, "2026-09-30T12:00:00Z"),
    order("customer-2", 3000, 0),
  ]);
  assert.equal(result.booked, 1);
  assert.equal(result.pending, 1);
  assert.equal(result.firstBookedAt?.toISOString(), "2026-10-02T12:00:00.000Z");
  assert.equal(result.netPaidCents, 8500);
});
