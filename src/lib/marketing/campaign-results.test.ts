import assert from "node:assert/strict";
import test from "node:test";
import { attachGoogleSpendCampaigns, type SpendCampaign } from "./campaign-results";

function formCampaign(id: string, name: string, formLeads: number): SpendCampaign {
  return { source: "google-ads", id, name, formLeads, linked: formLeads,
    bookedLeads: 1, appointments: 2, netPaidCents: 5000, ads: [] };
}

test("combines Google Ads form tags and spend rows with the same normalized campaign name", () => {
  const forms = [
    formCampaign("boarding_2026", "boarding_2026", 3),
    formCampaign("23916051495", "Boarding 2026", 2),
    formCampaign("daycare_2026", "daycare_2026", 1),
    formCampaign("training_2026", "training_2026", 2),
    formCampaign("mobile_grooming", "mobile_grooming", 2),
    formCampaign("summer_boarding_2026", "summer_boarding_2026", 22),
  ];
  const spend = [
    { id: "23916051495", name: "Boarding 2026", spendCents: 62252 },
    { id: "24018143404", name: "Daycare 2026", spendCents: 48503 },
    { id: "24192287445", name: "Training 2026", spendCents: 19913 },
    { id: "24260574436", name: "Mobile Grooming", spendCents: 34690 },
  ];
  const result = attachGoogleSpendCampaigns(forms, spend);
  assert.equal(result.length, 5);
  const boarding = result.find((row) => row.name === "Boarding 2026");
  assert.equal(boarding?.formLeads, 5);
  assert.equal(boarding?.linked, 5);
  assert.equal(boarding?.bookedLeads, 2);
  assert.equal(boarding?.appointments, 4);
  assert.equal(boarding?.netPaidCents, 10000);
  assert.equal(boarding?.googleSpend?.spendCents, 62252);
  assert.equal(boarding?.googleSpendMatchedByName, true);
  assert.equal(result.find((row) => row.name === "Daycare 2026")?.formLeads, 1);
  assert.equal(result.find((row) => row.name === "Training 2026")?.formLeads, 2);
  assert.equal(result.find((row) => row.name === "Mobile Grooming")?.formLeads, 2);
  assert.equal(result.find((row) => row.name === "summer_boarding_2026")?.formLeads, 22);
});

test("does not guess when spend names are ambiguous or an explicit numeric ID disagrees", () => {
  const forms = [formCampaign("boarding_2026", "boarding_2026", 3),
    formCampaign("111", "Daycare 2026", 2)];
  const spend = [
    { id: "222", name: "Boarding 2026", spendCents: 100 },
    { id: "333", name: "boarding-2026", spendCents: 200 },
    { id: "444", name: "Daycare 2026", spendCents: 300 },
  ];
  const result = attachGoogleSpendCampaigns(forms, spend);
  assert.equal(result.find((row) => row.id === "boarding_2026")?.googleSpend, undefined);
  assert.equal(result.find((row) => row.id === "111")?.googleSpend, undefined);
  assert.equal(result.filter((row) => row.googleSpend).length, 3);
});
