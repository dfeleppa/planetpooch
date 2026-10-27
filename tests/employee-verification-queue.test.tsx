import React from "react";
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { EmployeeVerificationQueue, type VerificationDay } from "../src/app/(finance)/finance/payroll/EmployeeVerificationQueue";

const days: VerificationDay[] = [{ date: "2026-10-17", label: "Saturday, Oct 17", employees: [
  { name: "Alex", expectedCashCents: 0, record: { expectedCashCents: 0, countedCashCents: 0, note: "" } },
  { name: "Blair", expectedCashCents: 15000, record: { expectedCashCents: 10000, countedCashCents: 10000, note: "" } },
  { name: "Casey", expectedCashCents: 0 },
] }, { date: "2026-10-18", label: "Sunday, Oct 18", employees: [] }];

function render(initialDate = days[0].date, busy = false) {
  return renderToStaticMarkup(<EmployeeVerificationQueue days={days} selectedEmployee="" initialDate={initialDate} busy={busy} onSelect={() => {}} onDayChange={() => {}} onWeeklyReview={() => {}} />);
}

test("daily checklist puts changed and unverified employees before verified zero-cash days", () => {
  const html = render();
  assert.match(html, /1 of 3 employees verified/);
  assert.match(html, /Needs update/);
  assert.match(html, /Not verified/);
  assert.ok(html.indexOf("Blair") < html.indexOf("Alex"));
  assert.ok(html.indexOf("Casey") < html.indexOf("Alex"));
});

test("returning from weekly review selects the requested day, including an empty day", () => {
  const html = render(days[1].date);
  assert.match(html, /No saved appointments for this day/);
  assert.doesNotMatch(html, /This day is verified/);
  assert.doesNotMatch(html, /Alex/);
});

test("checklist disables day and employee changes while verification is saving", () => {
  const html = render(days[0].date, true);
  assert.match(html, /<select[^>]*disabled/);
  assert.equal((html.match(/<button[^>]*disabled/g) ?? []).length, 4);
});

test("verified cards show color coded cash overage and shortage while pending cards show expected cash", () => {
  const varianceDays: VerificationDay[] = [{ date: "2026-10-17", label: "Saturday, Oct 17", employees: [
    { name: "Over", expectedCashCents: 10000, record: { expectedCashCents: 10000, countedCashCents: 12500, note: "" } },
    { name: "Short", expectedCashCents: 10000, record: { expectedCashCents: 10000, countedCashCents: 7500, note: "" } },
    { name: "Even", expectedCashCents: 10000, record: { expectedCashCents: 10000, countedCashCents: 10000, note: "" } },
    { name: "Pending", expectedCashCents: 10000 },
  ] }];
  const html = renderToStaticMarkup(<EmployeeVerificationQueue days={varianceDays} selectedEmployee="" busy={false} onSelect={() => {}} onDayChange={() => {}} onWeeklyReview={() => {}} />);
  assert.match(html, /text-green-800[^>]*>Over: \$25\.00/);
  assert.match(html, /text-red-700[^>]*>Short: \$25\.00/);
  assert.match(html, /Even: \$0\.00/);
  assert.match(html, /Expected cash: \$100\.00/);
});
