import test from "node:test";
import assert from "node:assert/strict";
import { combineCampaignRows } from "../src/lib/marketing/campaign-results";

test("combines ad-level form counts with campaign-level MoeGo outcomes once", () => {
  const rows = combineCampaignRows([
    { source: "meta", campaignId: "campaign-1", campaignName: "Daycare", adsetId: "set-1", adsetName: "Local", adId: "ad-1", adName: "First week", leads: 3 },
    { source: "meta", campaignId: "campaign-1", campaignName: "Daycare", adsetId: "set-1", adsetName: "Local", adId: "ad-2", adName: "Play", leads: 2 },
    { source: "google-ads", campaignId: "campaign-1", campaignName: "Search", adsetId: null, adsetName: null, adId: null, adName: null, leads: 4 },
  ], [
    { source: "meta", campaignId: "campaign-1", campaignName: "Daycare", leads: 4, bookedLeads: 2, appointments: 3, netPaidCents: 15000 },
    { source: "google-ads", campaignId: "campaign-1", campaignName: "Search", leads: 3, bookedLeads: 1, appointments: 1, netPaidCents: 5000 },
    { source: "unattributed", campaignId: null, campaignName: "Unattributed", leads: 1, bookedLeads: 0, appointments: 0, netPaidCents: 0 },
  ]);

  assert.equal(rows.length, 3);
  assert.deepEqual(rows.find((row) => row.source === "meta"), {
    source: "meta", id: "campaign-1", name: "Daycare", formLeads: 5,
    linked: 4, bookedLeads: 2, appointments: 3, netPaidCents: 15000,
    ads: [
      { source: "meta", campaignId: "campaign-1", campaignName: "Daycare", adsetId: "set-1", adsetName: "Local", adId: "ad-1", adName: "First week", leads: 3 },
      { source: "meta", campaignId: "campaign-1", campaignName: "Daycare", adsetId: "set-1", adsetName: "Local", adId: "ad-2", adName: "Play", leads: 2 },
    ],
  });
  assert.equal(rows.find((row) => row.source === "google-ads")?.formLeads, 4);
  assert.equal(rows.find((row) => row.source === "unattributed")?.linked, 1);
});
