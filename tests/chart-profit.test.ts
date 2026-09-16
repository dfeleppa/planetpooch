import assert from "node:assert/strict";
import test from "node:test";
import { profitBuckets, priorPeriod, yearAgoBuckets, yearAgoPeriod, metricTrend, type ChartBucket } from "../src/lib/moego/chart-profit";

test("30-day selection compares matching dates last year across New Year", () => {
  const range = yearAgoPeriod(new Date("2026-12-20"), new Date("2027-01-19"));
  assert.equal(range.from.toISOString(), "2025-12-20T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2026-01-19T00:00:00.000Z");
});

test("YTD comparison aligns historical calendar dates for every bucket", () => {
  const from = new Date("2026-01-01"), to = new Date("2026-09-17");
  for (const bucket of ["day", "week", "month", "quarter", "year"] as ChartBucket[]) {
    const rows = yearAgoBuckets(from, to, bucket, [
      { date: new Date("2025-01-01"), revenueCents: 100, orders: 1 },
      { date: new Date("2025-09-16"), revenueCents: 200, orders: 2 },
    ]);
    assert.deepEqual(rows.map(r => r.date), profitBuckets(from, to, bucket, []).map(r => r.date));
    assert.equal(rows[0].revenueCents, bucket === "year" ? 300 : 100);
    assert.equal(rows.reduce((s, r) => s + r.revenueCents, 0), 300);
    assert.equal(rows.reduce((s, r) => s + r.orders, 0), 3);
    assert.equal(rows.reduce((s, r) => s + r.expenseCents, 0), 61_050_000);
    assert.equal(rows.reduce((s, r) => s + r.profitCents, 0), 300 - 61_050_000);
  }
});

test("comparison conserves historical leap-day sales and actual expenses", () => {
  for (const bucket of ["day", "week", "month", "quarter", "year"] as ChartBucket[]) {
    const rows = yearAgoBuckets(new Date("2025-02-28"), new Date("2025-03-02"), bucket, [
      { date: new Date("2024-02-28"), revenueCents: 100, orders: 1 },
      { date: new Date("2024-02-29"), revenueCents: 200, orders: 2 },
      { date: new Date("2024-03-01"), revenueCents: 300, orders: 3 },
    ]);
    assert.equal(rows.reduce((s, r) => s + r.revenueCents, 0), 600);
    assert.equal(rows.reduce((s, r) => s + r.expenseCents, 0), Math.round(3 / 7 * 1_650_000));
  }
  const leapOnly = yearAgoBuckets(new Date("2024-02-29"), new Date("2024-03-01"), "day", [
    { date: new Date("2023-02-28"), revenueCents: 100, orders: 1 },
  ]);
  assert.equal(leapOnly[0].revenueCents, 100);
  assert.equal(leapOnly[0].expenseCents, Math.round(1_650_000 / 7));
});

test("year comparison uses matching calendar dates and includes leap-day endpoints", () => {
  const range = yearAgoPeriod(new Date("2026-01-01"), new Date("2026-09-17"));
  assert.equal(range.from.toISOString(), "2025-01-01T00:00:00.000Z");
  assert.equal(range.to.toISOString(), "2025-09-17T00:00:00.000Z");
  const leap = yearAgoPeriod(new Date("2024-02-29"), new Date("2024-03-01"));
  assert.equal(leap.from.toISOString(), "2023-02-28T00:00:00.000Z");
  assert.equal(leap.to.toISOString(), "2023-03-01T00:00:00.000Z");
});

test("trend handles growth, decline, expenses, losses, zero and flat baselines", () => {
  assert.equal(metricTrend(120, 100).percentage, 20);
  assert.equal(metricTrend(120, 100).favorable, true);
  assert.equal(metricTrend(80, 100).direction, "down");
  assert.equal(metricTrend(80, 100).favorable, false);
  assert.equal(metricTrend(80, 100, true).favorable, true);
  assert.equal(metricTrend(120, 100, true).favorable, false);
  assert.equal(metricTrend(50, -100).percentage, 150);
  assert.equal(metricTrend(50, -100).favorable, true);
  assert.equal(metricTrend(50, 0).percentage, null);
  assert.equal(metricTrend(100, 100).favorable, null);
});

test("prior period is adjacent, non-overlapping and equal length across leap day", () => {
  const from = new Date("2024-03-01");
  const to = new Date("2024-03-08");
  const prior = priorPeriod(from, to);
  assert.equal(prior.from.toISOString(), "2024-02-23T00:00:00.000Z");
  assert.equal(prior.to.toISOString(), from.toISOString());
  assert.equal(prior.to.getTime() - prior.from.getTime(), to.getTime() - from.getTime());
});

test("aligned prior buckets keep identical dates and expenses for partial months", () => {
  const from = new Date("2026-01-15"), to = new Date("2026-03-04");
  const current = profitBuckets(from, to, "month", []);
  const prior = profitBuckets(from, to, "month", [{ date: new Date("2026-02-01"), revenueCents: 100, orders: 1 }]);
  assert.deepEqual(prior.map(b => [b.date, b.expenseCents]), current.map(b => [b.date, b.expenseCents]));
  assert.equal(prior[1].revenueCents, 100);
});

test("seven days cost $16,500, including days without sales", () => {
  const rows = profitBuckets(new Date("2026-09-13"), new Date("2026-09-20"), "day", [
    { date: new Date("2026-09-13"), revenueCents: 2_000_000, orders: 3 },
  ]);
  assert.equal(rows.length, 7);
  assert.equal(rows.reduce((s, r) => s + r.expenseCents, 0), 1_650_000);
  assert.equal(rows.reduce((s, r) => s + r.profitCents, 0), 350_000);
  assert.ok(rows[1].profitCents < 0);
});

test("partial periods and all bucket choices have identical total expenses", () => {
  for (const bucket of ["day", "week", "month", "quarter", "year"] as ChartBucket[]) {
    const rows = profitBuckets(new Date("2026-01-15"), new Date("2026-03-04"), bucket, []);
    assert.equal(rows.reduce((s, r) => s + r.expenseCents, 0), Math.round(48 / 7 * 1_650_000));
    assert.ok(rows.every(r => r.profitCents === -r.expenseCents));
  }
});

test("leap-day and single-day expense proration", () => {
  const rows = profitBuckets(new Date("2024-02-29"), new Date("2024-03-01"), "month", []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].expenseCents, Math.round(1_650_000 / 7));
});
