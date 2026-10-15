import test from "node:test";
import assert from "node:assert/strict";
import { aggregateMetaSpend } from "../src/lib/marketing/meta-spend-breakdown";
import { attachMetaSpendCampaigns, type CombinedCampaign } from "../src/lib/marketing/campaign-results";

test("Meta campaign, ad set, and ad spend reconcile to the source total", () => {
  const spend = aggregateMetaSpend([
    { campaignId: "c1", campaignName: "Grooming", adsetId: "s1", adsetName: "Local", adId: "a1", adName: "Play", spendCents: 1200 },
    { campaignId: "c1", campaignName: "Grooming old name", adsetId: "s1", adsetName: "Local", adId: "a1", adName: "Play", spendCents: 300 },
    { campaignId: "c1", campaignName: "Grooming", adsetId: "s1", adsetName: "Local", adId: "a2", adName: "Bath", spendCents: 500 },
    { campaignId: "c2", campaignName: "Boarding", adsetId: "s2", adsetName: "Long stays", adId: "a3", adName: "Welcome", spendCents: 400 },
    { campaignId: null, campaignName: null, adsetId: null, adsetName: null, adId: "a4", adName: "Unassigned", spendCents: 100 },
  ]);
  assert.equal(spend.reduce((sum, row) => sum + row.spendCents, 0), 2500);
  assert.equal(spend.flatMap((row) => row.adsets).reduce((sum, row) => sum + row.spendCents, 0), 2500);
  assert.equal(spend.flatMap((row) => row.adsets.flatMap((set) => set.ads)).reduce((sum, row) => sum + row.spendCents, 0), 2500);
  assert.equal(spend.find((row) => row.id === "c1")?.adsets[0].ads.find((ad) => ad.id === "a1")?.spendCents, 1500);

  const formCampaign: CombinedCampaign = { source: "meta", id: "c1", name: "Old form tag", formLeads: 2,
    linked: 1, bookedLeads: 0, appointments: 0, netPaidCents: 0, ads: [] };
  const display = attachMetaSpendCampaigns([formCampaign], spend);
  assert.equal(display.find((row) => row.id === "c1")?.formLeads, 2);
  assert.equal(display.find((row) => row.id === "c1")?.metaSpend?.spendCents, 2000);
  assert.equal(display.find((row) => row.id === "c2")?.formLeads, 0);
  assert.equal(display.find((row) => row.id === null)?.metaSpend?.spendCents, 100);
});

test("a form without a campaign ID is not assigned another campaign's spend", () => {
  const forms: CombinedCampaign[] = [{ source: "meta", id: null, name: "Campaign not supplied", formLeads: 3,
    linked: 0, bookedLeads: 0, appointments: 0, netPaidCents: 0, ads: [] }];
  const display = attachMetaSpendCampaigns(forms, aggregateMetaSpend([
    { campaignId: "c1", campaignName: "Grooming", adsetId: "s1", adsetName: "Local", adId: "a1", adName: "Play", spendCents: 900 },
  ]));
  assert.equal(display[0].metaSpend, undefined);
  assert.equal(display[1].metaSpend?.spendCents, 900);
});

test("a form campaign tag containing a name can use one exact Meta campaign name without changing attribution", () => {
  const forms: CombinedCampaign[] = [{ source: "meta", id: "Grooming Sep 2026", name: "Grooming Sep 2026", formLeads: 37,
    linked: 37, bookedLeads: 2, appointments: 4, netPaidCents: 37902, ads: [] }];
  const spend = aggregateMetaSpend([
    { campaignId: "c1", campaignName: "Grooming Sep 2026", adsetId: "s1", adsetName: "Local", adId: "a1", adName: "Play", spendCents: 27637 },
  ]);
  const display = attachMetaSpendCampaigns(forms, spend);
  assert.equal(display.length, 1);
  assert.equal(display[0].id, "Grooming Sep 2026");
  assert.equal(display[0].spendMatchedByName, true);
  assert.equal(display[0].metaSpend?.spendCents, 27637);

  const ambiguous = attachMetaSpendCampaigns(forms, [spend[0], { ...spend[0], id: "c2" }]);
  assert.equal(ambiguous[0].metaSpend, undefined);
});
