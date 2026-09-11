import assert from "node:assert/strict";
import test from "node:test";
import { dashboardPeriods } from "./dashboard-periods";

const iso = (date: Date) => date.toISOString().slice(0, 10);

test("resort uses completed Sunday-Saturday sales and the following Friday check date", () => {
  const period = dashboardPeriods("RESORT", new Date("2026-09-11T16:00:00Z"));
  assert.equal(iso(period.today), "2026-09-11");
  assert.equal(iso(period.weekStart), "2026-08-30");
  assert.equal(iso(period.weekEndExclusive), "2026-09-06");
  assert.equal(iso(period.payrollWeekStart), "2026-08-30");
  assert.equal(iso(period.payrollCheckDate), "2026-09-11");
});

test("mobile payroll completes on Friday, independently of the Sunday sales week", () => {
  const friday = dashboardPeriods("GROOMING", new Date("2026-09-12T03:59:00Z"));
  const saturday = dashboardPeriods("GROOMING", new Date("2026-09-12T04:00:00Z"));
  assert.equal(iso(friday.payrollWeekStart), "2026-08-29");
  assert.equal(iso(saturday.payrollWeekStart), "2026-09-05");
  assert.equal(iso(friday.weekStart), "2026-08-30");
  assert.equal(iso(saturday.weekStart), "2026-08-30");
});

test("the reporting week rolls over at Eastern midnight, not UTC midnight", () => {
  const before = dashboardPeriods("RESORT", new Date("2026-09-13T03:59:00Z"));
  const after = dashboardPeriods("RESORT", new Date("2026-09-13T04:00:00Z"));
  assert.equal(iso(before.weekStart), "2026-08-30");
  assert.equal(iso(after.weekStart), "2026-09-06");
});

test("winter time and the year boundary keep six complete calendar weeks", () => {
  const period = dashboardPeriods("RESORT", new Date("2027-01-03T04:30:00Z"));
  assert.equal(iso(period.today), "2027-01-02");
  assert.equal(iso(period.weekStart), "2026-12-20");
  assert.equal(iso(period.trendStart), "2026-11-15");
  assert.equal(period.weekEndExclusive.getTime() - period.trendStart.getTime(), 42 * 86_400_000);
});
