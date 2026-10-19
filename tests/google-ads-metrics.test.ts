import assert from "node:assert/strict";
import test from "node:test";
import { normalizeGoogleAdsCampaign } from "../src/lib/marketing/google-ads-metrics";

test("Google Ads micro-units become cents without changing clicks or impressions", () => {
  assert.deepEqual(normalizeGoogleAdsCampaign({
    campaign: { id: "123", name: "Daycare", status: "ENABLED" },
    metrics: { clicks: "25", costMicros: "12345678", impressions: "1000" },
  }), { id: "123", name: "Daycare", status: "ENABLED", clicks: 25, costCents: 1235, impressions: 1000 });
});

test("missing metrics are zero but malformed Google values stop the sync", () => {
  assert.equal(normalizeGoogleAdsCampaign({}), null);
  assert.equal(normalizeGoogleAdsCampaign({ campaign: { id: "123" } })?.costCents, 0);
  assert.throws(() => normalizeGoogleAdsCampaign({ campaign: { id: "123" }, metrics: { costMicros: "bad" } }));
});
