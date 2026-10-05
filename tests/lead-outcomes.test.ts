import test from "node:test";
import assert from "node:assert/strict";
import { matchingOutcomeCustomerIds, summarizeLeadOutcome, type AppointmentOutcome, type OrderOutcome } from "../src/lib/marketing/lead-outcomes";

const receivedAt = new Date("2026-10-01T12:00:00Z");
const appointment = (customerMoegoId: string, status: string, createdTime = "2026-10-02T12:00:00Z"): AppointmentOutcome => ({
  customerMoegoId, status, createdTime: new Date(createdTime), isDeleted: false, noShow: false,
});
const order = (customerMoegoId: string, paidCents: number, refundedCents: number, salesDatetime = "2026-10-03T12:00:00Z"): OrderOutcome => ({
  customerMoegoId, paidCents, refundedCents, salesDatetime: new Date(salesDatetime),
  status: "COMPLETED", createdTime: new Date(salesDatetime), completedTime: null,
});

test("counts only post-submission bookings and net paid for matched customers", () => {
  const canceled = appointment("customer-1", "CANCELED");
  const noShow = { ...appointment("customer-1", "FINISHED"), noShow: true };
  const result = summarizeLeadOutcome(new Set(["customer-1"]), receivedAt, [
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

test("finds a booked and paid duplicate profile without matching a shared-phone household member", () => {
  const ids = matchingOutcomeCustomerIds({
    moegoCustomerId: "form-profile", phone: "+1 (555) 222-3333",
    firstName: "Julie", lastName: "Linzer", email: "julie@example.com",
  }, [
    { moegoId: "newer-profile", mainPhoneNumber: "5552223333", name: "Julie Linzer", email: "julie@example.com" },
    { moegoId: "household-member", mainPhoneNumber: "5552223333", name: "Sam Linzer", email: "sam@example.com" },
  ]);
  assert.deepEqual([...ids], ["form-profile", "newer-profile"]);
  const result = summarizeLeadOutcome(ids, receivedAt, [
    appointment("newer-profile", "FINISHED"),
    appointment("household-member", "FINISHED"),
  ], [order("newer-profile", 43466, 0), order("household-member", 15000, 0)]);
  assert.equal(result.booked, 1);
  assert.equal(result.netPaidCents, 43466);
});

test("can verify a renamed duplicate by matching email and phone", () => {
  const ids = matchingOutcomeCustomerIds({
    moegoCustomerId: "form-profile", phone: "5552223333",
    firstName: "Julie", lastName: "Linzer", email: "julie@example.com",
  }, [{ moegoId: "renamed-profile", mainPhoneNumber: "15552223333", name: "Julie Smith", email: "JULIE@example.com" }]);
  assert.equal(ids.has("renamed-profile"), true);
});
