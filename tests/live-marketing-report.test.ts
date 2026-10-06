import test from "node:test";
import assert from "node:assert/strict";
import { allocatePaidOrders, expandVerifiedSubmissionProfiles, type PaidOrder } from "../src/lib/marketing/live-report";

function order(customerMoegoId: string | null, sale: string, paidCents: number, refundedCents = 0): PaidOrder {
  return {
    customerMoegoId,
    createdTime: new Date(sale),
    salesDatetime: new Date(sale),
    completedTime: null,
    paidCents,
    refundedCents,
  };
}

test("assigns each sale to the latest prior linked form and keeps unsupported sales unattributed", () => {
  const result = allocatePaidOrders([
    order("customer-1", "2026-10-01T12:00:00Z", 5000),
    order("customer-1", "2026-10-03T12:00:00Z", 10000, 1000),
    order("customer-2", "2026-10-03T12:00:00Z", 2500),
    order(null, "2026-10-03T12:00:00Z", 1000),
  ], [
    { moegoCustomerId: "customer-1", receivedAt: new Date("2026-09-30T12:00:00Z"), attribution: { utm_source: "facebook" } },
    { moegoCustomerId: "customer-1", receivedAt: new Date("2026-10-02T12:00:00Z"), attribution: { gclid: "click-id" } },
    { moegoCustomerId: "customer-2", receivedAt: new Date("2026-10-04T12:00:00Z"), attribution: { utm_source: "facebook" } },
  ]);
  assert.deepEqual(result, { meta: 5000, "google-ads": 9000, "google-lsa": 0, unattributed: 3500 });
});

test("assigns revenue on a verified duplicate MoeGo profile without matching phone alone", () => {
  const submissions = expandVerifiedSubmissionProfiles([{
    moegoCustomerId: "original", receivedAt: new Date("2026-09-24T12:00:00Z"),
    attribution: { gclid: "click-id" }, firstName: "Jordan", lastName: "Taylor",
    phone: "516-555-0100", email: "jordan@example.com",
  }], [
    { moegoId: "duplicate", name: "Jordan Taylor", email: null, mainPhoneNumber: "516-555-0100" },
    { moegoId: "other-person", name: "Alex Taylor", email: null, mainPhoneNumber: "516-555-0100" },
  ], new Set(["duplicate", "other-person"]));
  const result = allocatePaidOrders([
    order("duplicate", "2026-09-25T12:00:00Z", 41439),
    order("other-person", "2026-09-25T12:00:00Z", 10000),
  ], submissions);
  assert.deepEqual(result, { meta: 0, "google-ads": 41439, "google-lsa": 0, unattributed: 10000 });
});
