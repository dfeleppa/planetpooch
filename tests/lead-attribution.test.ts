import assert from "node:assert/strict";
import test from "node:test";
import { classifyLeadAttribution } from "../src/lib/marketing/lead-attribution";

test("classifies Meta submissions from source or fbclid", () => {
  assert.equal(classifyLeadAttribution({ utm_source: "fb", utm_medium: "paid" }), "meta");
  assert.equal(classifyLeadAttribution({ fbclid: "click-id" }), "meta");
});

test("classifies Google Ads from click IDs", () => {
  assert.equal(classifyLeadAttribution({ gclid: "click-id" }), "google-ads");
  assert.equal(classifyLeadAttribution({ gbraid: "click-id" }), "google-ads");
});

test("classifies Google LSA before generic Google", () => {
  assert.equal(classifyLeadAttribution({ utm_source: "google", utm_campaign: "local-services-ads" }), "google-lsa");
});

test("explicit Google source wins over malformed or stale Meta click data", () => {
  assert.equal(classifyLeadAttribution({ utm_source: "google", utm_campaign: "24260574436", fbclid: "Consent wording from a form field" }), "google-ads");
  assert.equal(classifyLeadAttribution({ utm_source: "google", fbclid: "PAZXh0bgNhZW0BMQABp9" }), "google-ads");
  assert.equal(classifyLeadAttribution({ fbclid: "Consent wording from a form field" }), "unattributed");
});

test("leaves historical and direct submissions unattributed", () => {
  assert.equal(classifyLeadAttribution({}), "unattributed");
  assert.equal(classifyLeadAttribution({ utm_source: "direct" }), "unattributed");
});
