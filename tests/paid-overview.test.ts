import test from "node:test";
import assert from "node:assert/strict";
import { paidOverview } from "../src/lib/marketing/paid-overview";
import type { CombinedCampaign } from "../src/lib/marketing/campaign-results";

const row = (source: CombinedCampaign["source"], formLeads: number, netPaidCents: number): CombinedCampaign => ({ source, id: null, name: source, formLeads, netPaidCents, linked: 2, bookedLeads: 1, appointments: 2, ads: [] });
const rows = [row("meta", 10, 10000), row("google-ads", 20, 20000), row("google-lsa", 30, 90000), row("unattributed", 40, 80000)];
test("paid overview excludes LSA and unattributed leads and money", () => {
  const result = paidOverview(rows, ["meta", "google-ads", "google-lsa", "unattributed"], () => 10000, true, true, true);
  assert.deepEqual(result, { spend: 20000, leads: 30, linked: 4, booked: 2, appointments: 4, revenue: 30000, costPerBooked: 10000, roas: 1.5 });
});
test("missing data stays unknown and missing spend cannot yield ratios", () => {
  const result = paidOverview(rows, ["meta", "google-ads"], () => null, false, false, false);
  for (const key of ["spend", "leads", "booked", "appointments", "revenue", "costPerBooked", "roas"] as const) assert.equal(result[key], null);
});
test("source filtering and zero bookings preserve honest denominators", () => {
  assert.equal(paidOverview(rows, ["meta"], () => 10000, true, true, true).leads, 10);
  const empty = paidOverview([], ["meta"], () => 0, true, true, true);
  assert.equal(empty.booked, 0);
  assert.equal(empty.costPerBooked, null);
  assert.equal(empty.roas, null);
});
