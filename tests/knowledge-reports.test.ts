import assert from "node:assert/strict";
import test from "node:test";
import { reportKind } from "../src/lib/knowledge-reports";
import { completedReportWeeks, reportPeriod, reportQuarter } from "../src/lib/knowledge-report-period";
import { aggregateMetric, boardingTrendWeekCount, daycareVisitCount, fullReportWeeks, isDaycareVisitsPerStaffHourQuestion, isServiceRevenueTargetQuestion, requestedKpiMetrics } from "../src/lib/knowledge-report-kpis";
import { isWeeklyProfitComparison, profitMarginPercent, profitMetric } from "../src/lib/knowledge-report-profit-loss";
import { completedMobileGroomingWeek, isMobileGroomingSalesPerAppointmentQuestion } from "../src/lib/knowledge-report-mobile-sales";
import { isPayrollSalesRatioQuestion } from "../src/lib/knowledge-report-payroll-ratio";
import { adMetric, isAdPlatformCplComparisonQuestion, savedCampaignCpl } from "../src/lib/knowledge-report-ads";
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
  assert.equal(reportKind("What was Pet Resort payroll as a percentage of net sales last completed week?"), "payroll");
  assert.equal(reportKind("How many daycare visits per staff hour did we have last completed week, and was that above the target?"), "kpis");
  assert.equal(reportKind("What was Mobile Grooming net sales per appointment in the last completed reporting week?"), "profit-loss");
  assert.equal(reportKind("Which Pet Resort service segment missed its weekly revenue target by the most last completed week?"), "kpis");
  assert.equal(reportKind("Was Pet Resort profitable last week? Show revenue, labor cost, other expenses, profit and margin."), "profit-loss");
  assert.equal(reportKind("What was Pet Resort profitability last week?"), "profit-loss");
  assert.equal(reportKind("Show Pet Resort revenue, payroll, and profit last week"), "profit-loss");
  assert.equal(reportKind("Are our Google Ads campaigns profitable?"), "ads");
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
  const october = new Date("2026-10-02T16:00:00Z");
  assert.deepEqual(reportPeriod("last completed week", october),
    { start: "2026-09-20", end: "2026-09-26", label: "week ending 2026-09-26", kind: "week" });
  assert.deepEqual(reportPeriod("previous completed week", october),
    { start: "2026-09-13", end: "2026-09-19", label: "week ending 2026-09-19", kind: "week" });
  assert.deepEqual(completedReportWeeks(4, october).map((week) => week.start),
    ["2026-09-20", "2026-09-13", "2026-09-06", "2026-08-30"]);
  assert.deepEqual(completedMobileGroomingWeek(october), { start: "2026-09-19", end: "2026-09-25" });
});

test("management comparisons select complete matched periods", () => {
  assert.equal(isWeeklyProfitComparison("How did Pet Resort net profit change last completed week compared with the previous completed week?"), true);
  assert.equal(isWeeklyProfitComparison("How did net profit change for week ending 9/5 versus the previous week?"), true);
  assert.equal(isWeeklyProfitComparison("How did Pet Resort net sales last week compare with the previous week? Give dollar and percentage changes, explain what drove the change, and recommend the top two actions for next week."), true);
  assert.equal(isWeeklyProfitComparison("Was Pet Resort profitable last week? Show revenue, labor cost, other expenses, profit and margin. What is the biggest opportunity to improve margin?"), false);
  assert.equal(boardingTrendWeekCount("Has boarding occupancy improved over the last four completed weeks?"), 4);
  assert.equal(isPayrollSalesRatioQuestion("What was Pet Resort payroll as a percentage of net sales last completed week?"), true);
  assert.equal(isPayrollSalesRatioQuestion("Was payroll more than 40% of net sales last week?"), true);
  assert.equal(isDaycareVisitsPerStaffHourQuestion("daycare visits per staff hour"), true);
  assert.equal(isServiceRevenueTargetQuestion("Which Pet Resort service segment missed its weekly revenue target?"), true);
  assert.equal(isMobileGroomingSalesPerAppointmentQuestion("Mobile Grooming net sales per appointment last completed reporting week"), true);
  assert.equal(isAdPlatformCplComparisonQuestion("For Pet Resort, which had the lower cost per lead in the latest saved reporting month, Meta or Google Ads, and how many leads did each generate?"), true);
});

test("report metrics use the named calculation", () => {
  assert.equal(profitMetric("What was our estimated expense total?"), "estimated expenses");
  assert.equal(profitMetric("Was Pet Resort profitable last week?"), "net profit");
  assert.equal(adMetric("What was our ROAS?"), "roas");
  assert.equal(adMetric("What was cost per lead?"), "cpl");
  assert.deepEqual(savedCampaignCpl([{ leads: 10, costCents: null }]), { leads: 10, cpl: null });
  assert.deepEqual(savedCampaignCpl([{ leads: 0, costCents: 5000 }]), { leads: 0, cpl: null });
  assert.deepEqual(savedCampaignCpl([{ leads: 2, costCents: 1000 }, { leads: 3, costCents: 1500 }]), { leads: 5, cpl: 500 });
  const boarding = KPI_SEGMENTS.find((segment) => segment.key === "BOARDING")!;
  assert.deepEqual(requestedKpiMetrics("boarding occupancy rate", boarding.metrics).map((metric) => metric.key), ["occupancy_rate"]);
  assert.deepEqual(requestedKpiMetrics("boarding revenue and nights", boarding.metrics).map((metric) => metric.key), ["revenue", "nights"]);
  const occupancy = boarding.metrics.find((metric) => metric.key === "occupancy_rate")!;
  assert.equal(aggregateMetric(occupancy, [3450, 5000], [8700, 12600]).value, 4226);
  assert.equal(profitMarginPercent(-26055, 1623945)?.toFixed(1), "-1.6");
  assert.equal(profitMarginPercent(658320, 2308320)?.toFixed(1), "28.5");
  assert.equal(profitMarginPercent(0, 0), null);
  assert.equal(daycareVisitCount({ total_appointments: 10600, half_day_daycare: 100,
    full_day_enrichment_activity: 700, half_day_enrichment_activity: 0, evaluations: 700 }), 114);
  assert.equal(daycareVisitCount({ total_appointments: 10600 }), null);
});

test("assistant expense total agrees with the Profit and Loss chart buckets", () => {
  const from = new Date("2026-07-05T00:00:00Z");
  const to = new Date("2026-09-20T00:00:00Z");
  const chartExpenses = profitBuckets(from, to, "week", [])
    .reduce((sum, bucket) => sum + bucket.expenseCents, 0);
  assert.equal(estimatedExpenseCents(from, to), chartExpenses);
});
