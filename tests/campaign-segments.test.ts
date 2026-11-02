import test from "node:test";
import assert from "node:assert/strict";
import { suggestedSegment, segmentForCampaign, groupCampaignSegments, type SegmentCampaign } from "../src/lib/marketing/campaign-segments";
import type { CampaignWithSpend } from "../src/lib/marketing/campaign-results";
test("clear service names are grouped and mixed campaigns remain unassigned", () => {
  for (const [name, expected] of [["Mobile Grooming Fall", "mobile-grooming"], ["In-house Grooming", "in-house-grooming"], ["Grooming Search", "generic-grooming"], ["Boarding holiday", "boarding"], ["Day Care", "daycare"], ["Training", "training"], ["Boarding and Daycare", "unassigned"], ["General brand", "unassigned"]]) assert.equal(suggestedSegment(name), expected);
});
test("saved segments override suggestions for IDs and legacy tags, within their source", () => {
  const catalog: SegmentCampaign[] = [{ source: "meta", id: "123", name: "Grooming", aliases: ["grooming_old"], segment: "in-house-grooming", saved: true }];
  assert.equal(segmentForCampaign({ source: "meta", id: "123", name: "New name" }, catalog), "in-house-grooming");
  assert.equal(segmentForCampaign({ source: "meta", id: "grooming_old", name: "grooming_old" }, catalog), "in-house-grooming");
  assert.equal(segmentForCampaign({ source: "google-ads", id: "123", name: "Grooming" }, catalog), "generic-grooming");
  const rows = [{ source: "meta", id: "123", name: "Grooming" }, { source: "meta", id: "other", name: "Daycare Fall" }] as CampaignWithSpend[];
  const groups = groupCampaignSegments(rows, catalog);
  assert.deepEqual(groups.map((row) => row.value), ["in-house-grooming", "daycare"]);
  assert.equal(groups.flatMap((row) => row.campaigns).length, rows.length);
});
