import test from "node:test";
import assert from "node:assert/strict";
import { conversionMetrics, conversionCustomerKeys } from "../src/lib/marketing/conversions";
import { attachGoogleSpendCampaigns, combineCampaignRows } from "../src/lib/marketing/campaign-results";
import { summarizeGoogleLsaCallOutcomes } from "../src/lib/marketing/google-lsa-call-outcomes";

test("two paying customers spending $50 each produce 2 conversions and $50 value", () => {
  assert.deepEqual(conversionMetrics([{customerKey: "a", netPaidCents: 5000}, {customerKey: "b", netPaidCents: 5000}], true), {conversions: 2, valuePerConversion: 5000});
});
test("repeat forms and campaigns count one customer and refunds reduce value", () => {
  assert.deepEqual(conversionMetrics([{customerKey: "a", netPaidCents: 5000}, {customerKey: "a", netPaidCents: 3000}, {customerKey: "a", netPaidCents: -1000}, {customerKey: "b", netPaidCents: 0}], true), {conversions: 1, valuePerConversion: 7000});
  assert.deepEqual(conversionMetrics([{customerKey: "a", netPaidCents: 0}], true), {conversions: 0, valuePerConversion: null});
  assert.deepEqual(conversionMetrics([], false), {conversions: null, valuePerConversion: null});
});
test("verified duplicate chains deduplicate without merging other customers", () => {
  const keys = conversionCustomerKeys([{id:"a", customerIds: new Set(["1", "2"])}, {id:"b", customerIds: new Set(["3", "2"])}, {id:"c", customerIds: new Set(["4"])}]);
  assert.equal(keys.get("a"), keys.get("b"));
  assert.notEqual(keys.get("a"), keys.get("c"));
});
test("Google campaign name merging preserves payments and unique customer totals", () => {
  const outcomes = ["mobile_grooming", "Mobile Grooming"].map((name) => ({source: "google-ads" as const, campaignId: name, campaignName: name, leads: 1, bookedLeads: 1, appointments: 1, netPaidCents: 5000, customerPayments: [{customerKey: "same", netPaidCents: 5000}]}));
  const rows = attachGoogleSpendCampaigns(combineCampaignRows([], outcomes), [{id:"123", name:"Mobile Grooming", spendCents: 1000}]);
  assert.equal(rows.length, 1);
  assert.deepEqual(conversionMetrics(rows[0].customerPayments ?? [], true), {conversions: 1, valuePerConversion: 10000});
});

test("LSA counts a repeat caller once, subtracts refunds, and excludes ambiguous matches", () => {
  const calls = [{id:"a", customer:"5165550100", leadReceived:"2026-10-01"}, {id:"b", customer:"5165550100", leadReceived:"2026-10-03"}];
  const profiles = [{moegoId:"customer", mainPhoneNumber:"5165550100"}];
  const order = (id: string, date: string, refund = 0) => ({moegoId:id, customerMoegoId:"customer", createdTime:new Date(date), salesDatetime:null, completedTime:null, status:"COMPLETED", paidCents:5000, refundedCents:refund});
  const orders = [order("1", "2026-10-02T16:00:00Z"), order("2", "2026-10-04T16:00:00Z", 1000)];
  const result = summarizeGoogleLsaCallOutcomes(calls, profiles, [], orders);
  assert.equal(result.conversions, 1);
  assert.equal(result.valuePerConversion, 9000);
  const ambiguous = summarizeGoogleLsaCallOutcomes(calls, [...profiles, {moegoId:"other", mainPhoneNumber:"5165550100"}], [], orders);
  assert.equal(ambiguous.conversions, 0);
  assert.equal(ambiguous.valuePerConversion, null);
});
