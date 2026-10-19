import test from "node:test";
import assert from "node:assert/strict";
import { aggregateGoogleSpend, attachGoogleSpendCampaigns, type SpendCampaign } from "../src/lib/marketing/campaign-results";

const campaign = (id: string, name: string, formLeads = 0): SpendCampaign => ({
  source: "google-ads", id, name, formLeads, linked: formLeads,
  bookedLeads: 0, appointments: 0, netPaidCents: 0, ads: [],
});

test("Google Ads campaign spend matches the same ID and reconciles to the source total", () => {
  const spend = aggregateGoogleSpend([
    { campaignId: "24260574436", campaign: "Mobile Grooming", costCents: 33454 },
    { campaignId: "23916051495", campaign: "Boarding 2026", costCents: 57692 },
    { campaignId: "24018143404", campaign: "Daycare 2026", costCents: 49910 },
    { campaignId: "24192287445", campaign: "Training 2026", costCents: 20039 },
    { campaignId: "23665451929", campaign: "Search - North Shore", costCents: 0 },
  ]);
  const displayed = attachGoogleSpendCampaigns([
    campaign("24260574436", "24260574436", 11),
    campaign("summer_boarding_2026", "summer_boarding_2026", 22),
  ], spend);
  assert.equal(spend.reduce((sum, row) => sum + row.spendCents, 0), 161095);
  assert.equal(displayed.find((row) => row.id === "24260574436")?.googleSpend?.spendCents, 33454);
  assert.equal(displayed.find((row) => row.id === "24260574436")?.formLeads, 11);
  assert.equal(displayed.find((row) => row.id === "summer_boarding_2026")?.googleSpend, undefined);
  assert.equal(displayed.find((row) => row.id === "23916051495")?.googleSpend?.spendCents, 57692);
  assert.equal(displayed.find((row) => row.id === "23665451929"), undefined);
  assert.equal(displayed.filter((row) => row.googleSpend).reduce((sum, row) => sum + row.googleSpend!.spendCents, 0), 161095);
});

test("manual source spend does not assign stale campaign-level amounts", () => {
  const displayed = attachGoogleSpendCampaigns([campaign("24260574436", "Mobile Grooming", 11)], null);
  assert.equal(displayed[0].googleSpend, undefined);
});
