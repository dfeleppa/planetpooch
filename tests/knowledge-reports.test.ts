import assert from "node:assert/strict";
import test from "node:test";
import { reportKind } from "../src/lib/knowledge-reports";
import { reportPeriod, reportQuarter } from "../src/lib/knowledge-report-period";
import { aggregateMetric, fullReportWeeks, requestedKpiMetrics } from "../src/lib/knowledge-report-kpis";
import { profitMetric } from "../src/lib/knowledge-report-profit-loss";
import { adMetric } from "../src/lib/knowledge-report-ads";
import { KPI_SEGMENTS } from "../src/lib/kpis";
import { estimatedExpenseCents } from "../src/lib/moego/profit-loss-totals";
import { profitBuckets } from "../src/lib/moego/chart-profit";

test("report questions select the report rather than raw database search", () => {
  assert.equal(reportKind("What was total revenue for Q3 this year?"), "profit-loss");
  assert.equal(reportKind("What was boarding occupancy rate for week ending 9/5?"), "kpis");
  assert.equal(reportKind("What were daycare staff hours last month?"), "kpis");
  assert.equal(reportKind("Pet Resort payroll for last week"), "payroll");
  assert.equal(reportKind("How much did Google Ads cost last month?"), "ads");
  assert.equal(reportKind("How many expired daycare packages?"), "daycare");
  assert.equal(reportKind("What is Jane Smith's phone number?"), null);
});

test("report periods preserve a partial quarter and a completed week", () => {
  const now = new Date("2026-09-25T16:00:00Z");
  assert.deepEqual(reportQuarter("Q3 this year", now),
    { start: "2026-07-01", end: "2026-09-25", label: "Q3 2026 to date", kind: "quarter", quarterEnd: "2026-09-30" });
  assert.deepEqual(reportPeriod("week ending 9/5", now),
    { start: "2026-08-30", end: "2026-09-05", label: "week ending 2026-09-05", kind: "week" });
  assert.deepEqual(reportPeriod("last quarter", now),
    { start: "2026-04-01", end: "2026-06-30", label: "Q2 2026", kind: "quarter", quarterEnd: "2026-06-30" });
  assert.deepEqual(reportPeriod("September 2026", now),
    { start: "2026-09-01", end: "2026-09-25", label: "September 2026 to date", kind: "month" });
  assert.deepEqual(reportPeriod("Q4 2026", now),
    { start: "2026-10-01", end: "2026-12-31", label: "Q4 2026 (upcoming)", kind: "quarter", quarterEnd: "2026-12-31" });
  assert.deepEqual(fullReportWeeks("2026-07-01", "2026-09-25").at(-1), "2026-09-13");
});

test("report metrics use the named calculation", () => {
  assert.equal(profitMetric("What was our estimated expense total?"), "estimated expenses");
  assert.equal(adMetric("What was our ROAS?"), "roas");
  assert.equal(adMetric("What was cost per lead?"), "cpl");
  const boarding = KPI_SEGMENTS.find((segment) => segment.key === "BOARDING")!;
  assert.deepEqual(requestedKpiMetrics("boarding occupancy rate", boarding.metrics).map((metric) => metric.key), ["occupancy_rate"]);
  assert.deepEqual(requestedKpiMetrics("boarding revenue and nights", boarding.metrics).map((metric) => metric.key), ["revenue", "nights"]);
  const occupancy = boarding.metrics.find((metric) => metric.key === "occupancy_rate")!;
  assert.equal(aggregateMetric(occupancy, [3450, 5000], [8700, 12600]).value, 4226);
});

test("assistant expense total agrees with the Profit and Loss chart buckets", () => {
  const from = new Date("2026-07-05T00:00:00Z");
  const to = new Date("2026-09-20T00:00:00Z");
  const chartExpenses = profitBuckets(from, to, "week", [])
    .reduce((sum, bucket) => sum + bucket.expenseCents, 0);
  assert.equal(estimatedExpenseCents(from, to), chartExpenses);
});
