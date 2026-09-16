import assert from "node:assert/strict";
import test from "node:test";
import { profitBuckets, type ChartBucket } from "../src/lib/moego/chart-profit";

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
