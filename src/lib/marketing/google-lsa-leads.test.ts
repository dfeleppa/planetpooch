import assert from "node:assert/strict";
import { test } from "node:test";
import { leadsInPeriod, lsaLeadDay, GOOGLE_LSA_LEAD_COST_CENTS } from "./google-lsa-leads";

function lead(id: string, received: string, updatedAt: string, customer = "(631) 555-0100", periodStart = "2026-09-16") {
  return {
    id, business: "pet-resort", customer, jobType: "Dog boarding", searchIntent: "Categorical",
    location: "Farmingdale", leadType: "Phone call", leadReceived: received,
    updatedAt: new Date(updatedAt), rowOrder: 0,
    periodStart: new Date(`${periodStart}T00:00:00Z`), periodEnd: new Date("2026-10-19T00:00:00Z"),
  };
}

test("parses Google LSA calendar dates without shifting their day", () => {
  assert.equal(lsaLeadDay("Oct 13 2026"), "2026-10-13");
  assert.equal(lsaLeadDay("Oct 13, 2026"), "2026-10-13");
  assert.equal(lsaLeadDay("2026-02-30"), null);
});

test("counts overlapping CSV snapshots once and filters by lead received date", () => {
  const rows = [
    lead("older-copy", "Oct 13 2026", "2026-10-14T00:00:00Z"),
    lead("newer-copy", "Oct 13 2026", "2026-10-19T00:00:00Z", "631-555-0100", "2026-09-20"),
    lead("early", "Sep 16 2026", "2026-10-14T00:00:00Z", "(631) 555-0101"),
    lead("late", "Oct 19 2026", "2026-10-19T00:00:00Z", "(631) 555-0102"),
  ];
  const result = leadsInPeriod(rows, "2026-09-20", "2026-10-19");
  assert.deepEqual(result.map((row) => row.id), ["late", "newer-copy"]);
  assert.equal(result.length * GOOGLE_LSA_LEAD_COST_CENTS, 5_600);
});

test("keeps two matching calls from the same import while removing older snapshot copies", () => {
  const rows = [
    lead("new-a", "Oct 13 2026", "2026-10-19T00:00:00Z", "6315550100", "2026-09-20"),
    lead("new-b", "Oct 13 2026", "2026-10-19T00:00:00Z", "6315550100", "2026-09-20"),
    lead("old-a", "Oct 13 2026", "2026-10-14T00:00:00Z"),
  ];
  assert.deepEqual(leadsInPeriod(rows, "2026-09-20", "2026-10-19").map((row) => row.id), ["new-a", "new-b"]);
});
