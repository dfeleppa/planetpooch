import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeGoogleLsaCallOutcomes } from "./google-lsa-call-outcomes";

test("LSA outcomes exclude call-day activity, ambiguous phones, and duplicate events", () => {
  const calls = [
    { id: "first", leadReceived: "Jan 1, 2026", customer: "(631) 555-0100" },
    { id: "second", leadReceived: "Jan 3, 2026", customer: "6315550100" },
    { id: "ambiguous", leadReceived: "Jan 1, 2026", customer: "6315550200" },
  ];
  const profiles = [
    { moegoId: "c1", mainPhoneNumber: "+16315550100" },
    { moegoId: "c2", mainPhoneNumber: "6315550200" },
    { moegoId: "c3", mainPhoneNumber: "6315550200" },
  ];
  const appointment = (id: string, customerMoegoId: string, createdTime: string, status = "CONFIRMED") => ({
    moegoId: id, customerMoegoId, createdTime: new Date(createdTime),
    status, isDeleted: false, noShow: false,
  });
  const appointments = [
    appointment("call-day", "c1", "2026-01-01T16:00:00Z"),
    appointment("after-first", "c1", "2026-01-02T15:00:00Z"),
    appointment("second-call-day", "c1", "2026-01-03T16:00:00Z"),
    appointment("after-second", "c1", "2026-01-04T15:00:00Z"),
    appointment("duplicate", "c1", "2026-01-04T15:00:00Z"),
    appointment("duplicate", "c1", "2026-01-04T15:00:00Z"),
    appointment("ambiguous-profile", "c2", "2026-01-04T15:00:00Z"),
    appointment("cancelled", "c1", "2026-01-05T15:00:00Z", "CANCELLED"),
  ];
  const order = (id: string, customerMoegoId: string, salesDatetime: string) => ({
    moegoId: id, customerMoegoId, createdTime: new Date(salesDatetime),
    salesDatetime: new Date(salesDatetime), completedTime: null,
    status: "COMPLETED", paidCents: 2_000, refundedCents: 500,
  });
  const orders = [
    order("call-day", "c1", "2026-01-01T23:00:00Z"),
    order("after-first", "c1", "2026-01-02T15:00:00Z"),
    order("second-call-day", "c1", "2026-01-03T16:00:00Z"),
    order("after-second", "c1", "2026-01-04T15:00:00Z"),
    order("ambiguous-profile", "c3", "2026-01-04T15:00:00Z"),
  ];
  assert.deepEqual(summarizeGoogleLsaCallOutcomes(calls, profiles, appointments, orders), {
    linked: 3, ambiguous: 1, bookedLeads: 2, appointments: 3, netPaidCents: 3_000,
  });
});

test("New York date cutoff uses UTC timestamps across the evening boundary", () => {
  const summary = summarizeGoogleLsaCallOutcomes(
    [{ id: "lead", leadReceived: "Oct 19, 2026", customer: "6315550100" }],
    [{ moegoId: "customer", mainPhoneNumber: "6315550100" }],
    [
      { moegoId: "same-evening", customerMoegoId: "customer", createdTime: new Date("2026-10-20T03:59:00Z"),
        status: "CONFIRMED", isDeleted: false, noShow: false },
      { moegoId: "next-day", customerMoegoId: "customer", createdTime: new Date("2026-10-20T04:01:00Z"),
        status: "CONFIRMED", isDeleted: false, noShow: false },
    ],
    [],
  );
  assert.equal(summary.appointments, 1);
  assert.equal(summary.bookedLeads, 1);
});
