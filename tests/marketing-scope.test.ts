import test from "node:test";
import assert from "node:assert/strict";
import { reportScope, matchesInquiryScope, marketingViewUrl } from "../src/lib/marketing/report-scope";
import { reportingRange } from "../src/app/(marketing)/marketing/ad-reporting/report-range";

test("business and service intersect without treating a multi-service inquiry as multiple leads", () => {
  const rows = [{ company: "RESORT", services: ["Daycare", "Grooming"] }, { company: "GROOMING", services: ["Grooming"] }, { company: "RESORT", services: [] }];
  assert.equal(rows.filter((row) => matchesInquiryScope(row, { business: "pet-resort", service: "grooming" })).length, 1);
  assert.equal(rows.filter((row) => matchesInquiryScope(row, { business: "mobile-grooming", service: "daycare" })).length, 0);
  assert.equal(rows.filter((row) => matchesInquiryScope(row, { business: "all", service: "all" })).length, 3);
});
test("tabs preserve exact dates, business, service, source and comparison but drop creative-only filters", () => {
  const query = { from: "2026-10-01", to: "2026-10-31", business: "pet-resort", service: "boarding", source: "meta", compare: "previous", campaign: "Old campaign", sort: "cpl" };
  for (const view of ["results", "creatives", "follow-up"]) {
    const params = new URL(marketingViewUrl(query, view), "https://example.com").searchParams;
    assert.equal(params.get("from"), query.from);
    assert.equal(params.get("to"), query.to);
    assert.equal(params.get("business"), query.business);
    assert.equal(params.get("service"), query.service);
    assert.equal(params.get("source"), query.source);
    assert.equal(params.get("compare"), query.compare);
    assert.equal(params.has("campaign"), false);
    assert.equal(params.has("sort"), false);
  }
});
test("both views resolve the same completed-day period and invalid scopes normalize safely", () => {
  const report = reportingRange({ days: "7" });
  const params = Object.fromEntries(new URL(marketingViewUrl({ from: report.from, to: report.to }, "creatives"), "https://example.com").searchParams);
  const creative = reportingRange(params);
  assert.equal(creative.from, report.from);
  assert.equal(creative.to, report.to);
  assert.deepEqual(reportScope({business: "invalid", service: "invalid"}), { business: "all", service: "all" });
});
