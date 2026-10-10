const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");
function load(file, dependencies = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: (name) => dependencies[name] ?? require(name), Date, console };
  vm.runInNewContext(js, context);
  return context.exports;
}
const dateRange = load("src/lib/marketing/submission-date-range.ts");
const periods = load("src/lib/knowledge-report-period.ts", {
  "@/lib/marketing/submission-date-range": dateRange,
  "@/lib/moego/chart-date-range": { chartPresetRange: () => ({ from: "2026-09-27", to: "2026-10-03" }) },
  "@/lib/knowledge-app-data": { orderDateRange: (q) => {
    const dates = q.match(/\d{4}-\d{2}-\d{2}/g);
    return dates ? { start: dates[0], end: dates.at(-1) } : null;
  } },
});
const evidence = load("src/lib/knowledge-evidence-plan.ts", {
  "@/lib/knowledge-report-period": periods,
  "@/lib/knowledge-answer-policy": load("src/lib/knowledge-answer-policy.ts"),
});
const now = new Date("2026-10-10T14:00:00Z");
const cases = [
  ["Which service—boarding, daycare, training, or grooming—offers the strongest growth opportunity based on recent trends, capacity, and available margin data?", "kpi-history"],
  ["Are we on track to hit this quarter’s revenue targets? What weekly sales pace do we need for the remainder of the quarter?", "kpi-history"],
  ["Is revenue growth coming from more customers, more visits per customer, or higher spending per visit?", "profit-loss"],
  ["Which days have the most unused daycare or boarding capacity, and what targeted offers could fill them profitably?", "kpi-history"],
  ["Is our customer retention improving or deteriorating? Which customer groups should we prioritize for retention efforts?", "kpi-history"],
  ["Would a 5% price increase improve profitability? Show scenarios for losing 0%, 5%, or 10% of booking volume and state your assumptions.", "profit-loss"],
  ["Are daycare packages increasing visit frequency and customer value, or mainly discounting visits customers would have purchased anyway?", "daycare"],
  ["How productive is Mobile Grooming compared with previous months, and do we have enough demand to justify adding another van?", "kpi-history"],
  ["Where are we losing potential customers between website visits, inquiries, bookings, and completed services? Which improvement should we test first?", "funnel"],
  ["If we had $5,000 to invest next month, how would you prioritize marketing, staffing, equipment, and customer retention?", "ads"],
];
for (const [question, report] of cases) test(`planner failure still supplies relevant strategy evidence: ${report}`, () => {
  assert.ok(evidence.supplementReportPlan(question, null, now).tasks.some((task) => task.report === report));
});

const kpis = load("src/lib/kpis.ts");
const baseKpiDeps = { "@/lib/prisma": {}, "@/lib/kpis": kpis, "@/lib/knowledge-kpis": {},
  "@/lib/kpi-standing": load("src/lib/kpi-standing.ts"), "@/lib/payroll-kpis": {},
  "@/lib/utils": { formatKpiValue: (n) => String(n / 100) },
  "@/lib/week": { toWeekParam: (d) => d.toISOString().slice(0, 10) },
  "@/lib/knowledge-report-period": periods, "@/lib/marketing/submission-date-range": dateRange };
const kpiQueries = load("src/lib/knowledge-kpis.ts", baseKpiDeps);
function historyModule(rows = []) {
  return load("src/lib/knowledge-kpi-history.ts", { ...baseKpiDeps,
    "@/lib/knowledge-kpis": kpiQueries,
    "@/lib/knowledge-report-kpis": load("src/lib/knowledge-report-kpis.ts", baseKpiDeps),
    "@/lib/business-server": { getActiveBusiness: async () => business },
    "@/lib/payroll-kpis": { getResortStaffHoursByWeek: async () => new Map() },
    "@/lib/prisma": { prisma: { kpiWeeklyValue: { findMany: async () => rows },
      kpiStandingValue: { findMany: async () => [] } } },
  });
}
test("history excludes incomplete/boundary weeks, honors quarter dates, and caps long requests", () => {
  const history = historyModule();
  const monthly = history.historyWindow("Mobile Grooming compared with previous months", now);
  assert.equal(monthly.start, "2026-07-01");
  assert.equal(monthly.end, "2026-09-30");
  assert.equal(monthly.weeks[0], "2026-07-05");
  assert.equal(monthly.weeks.at(-1), "2026-09-20");
  assert.match(monthly.assumption, /not full calendar-month totals/);
  const quarter = history.historyWindow("this quarter", now);
  assert.equal(quarter.weeks.length, 0); // Oct 4–10 has not completed yet.
  const long = history.historyWindow("from 2025-01-01 to 2026-10-10", now);
  assert.equal(long.weeks.length, 26);
  assert.equal(long.capped, true);
});
test("KPI history preserves scoped services and marks partial daycare aggregates unknown", async () => {
  const module = historyModule([
    { segment: "DAYCARE", metricKey: "total_appointments", value: 10000, weekStart: new Date("2026-09-27"), updatedAt: now },
    { segment: "DAYCARE", metricKey: "total_daycare_appointments", value: 10000, weekStart: new Date("2026-09-27"), updatedAt: now },
  ]);
  const sources = await module.findKpiHistory("boarding and daycare from 2026-09-27 to 2026-10-03");
  assert.equal(sources.length, 2);
  assert.ok(sources.every((s) => !/Mobile Grooming/.test(s.title)));
  const daycare = sources.find((s) => /Daycare/.test(s.title));
  assert.match(daycare.excerpt, /Total Daycare Appointments?: missing/i);
  assert.match(daycare.excerpt, /Weekly distinct clients may repeat/);
});
test("growth periods are equal completed windows and retain business scope", () => {
  const tasks = evidence.supplementReportPlan("Explain Mobile Grooming revenue growth", null, now).tasks.filter((t) => t.report === "profit-loss");
  assert.equal(tasks.length, 2);
  assert.match(tasks[0].question, /Mobile Grooming.*2026-09-06 to 2026-10-03/);
  assert.match(tasks[1].question, /Mobile Grooming.*2026-08-09 to 2026-09-05/);
});
test("investment horizon does not become future actuals; retention does not invent daycare scope", () => {
  const tasks = evidence.supplementReportPlan(cases.at(-1)[0], null, now).tasks;
  assert.match(tasks.find((t) => t.report === "ads").question, /latest saved month/);
  assert.ok(!evidence.supplementReportPlan("How can we improve customer retention?", null, now).tasks.some((t) => t.report === "daycare"));
});
const source = (id) => ({ id, excerpt: "Fact [1]", title: id, kind: "record", url: "/knowledge", updatedAt: now.toISOString(), dateKind: "entry", answer: "fragment" });
test("fair evidence selection preserves secondary reports, deduplicates and reports caps/failures", () => {
  const plan = { tasks: [{ report: "kpi-history" }, { report: "profit-loss" }, { report: "ads" }], needsAnalysis: true };
  const output = evidence.collectReportEvidence(plan, [
    { status: "fulfilled", value: Array.from({ length: 12 }, (_, i) => source(`kpi${i}`)) },
    { status: "fulfilled", value: [source("sales"), source("kpi0")] },
    { status: "rejected", reason: new Error("private details") },
  ]);
  assert.equal(output.length, 10);
  assert.ok(output.some((s) => s.id === "sales"));
  assert.equal(new Set(output.map((s) => s.id)).size, output.length);
  assert.match(output.at(-1).excerpt, /lookup failed.*availability is unknown/);
  assert.match(output.at(-1).excerpt, /omitted/);
  assert.doesNotMatch(output.at(-1).excerpt, /private details/);
  assert.ok(output.every((s) => s.answer === undefined));
});
const business = load("src/lib/business.ts").BUSINESSES[0];
const funnel = load("src/lib/knowledge-funnel.ts", {
  "@/lib/prisma": {}, "@/lib/business": { BUSINESSES: [business] }, "@/lib/business-server": {},
  "@/lib/knowledge-report-period": periods, "@/lib/marketing/submission-date-range": dateRange,
});
test("funnel deduplicates customers and excludes old, cancelled, deleted and no-show appointments", () => {
  const lead = (id) => ({ moegoCustomerId: id, receivedAt: new Date("2026-10-01") });
  const appointment = (id, extra = {}) => ({ customerMoegoId: id, createdTime: new Date("2026-10-02"), startTime: new Date("2026-10-03"), status: "FINISHED", isDeleted: false, noShow: false, ...extra });
  const result = funnel.funnelCohort([lead("a"), lead("a"), lead("b"), lead("c"), lead(null)], [
    appointment("a"), appointment("a"), appointment("b", { noShow: true }), appointment("b", { isDeleted: true }),
    appointment("b", { status: "CANCELLED" }), appointment("b", { createdTime: new Date("2026-09-30") }),
    appointment("c", { status: "CONFIRMED", startTime: new Date("2026-12-01") }), appointment("unknown"),
  ], now);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { linkedCustomers: 3, booked: 2, completed: 1 });
});
test("funnel refuses partial outcome totals when the cohort cap is exceeded", async () => {
  const module = load("src/lib/knowledge-funnel.ts", {
    "@/lib/business": { BUSINESSES: [business] }, "@/lib/business-server": { getActiveBusiness: async () => business },
    "@/lib/knowledge-report-period": periods, "@/lib/marketing/submission-date-range": dateRange,
    "@/lib/prisma": { prisma: {
      websiteFormSubmission: { count: async () => 2000, findMany: async () => Array.from({ length: 1001 }, () => ({ moegoCustomerId: "a", receivedAt: now })) },
      moegoSyncState: { findUnique: async () => ({ lastSyncedAt: now }) },
      moegoAppointment: { findMany: async () => assert.fail("Capped forms must not produce partial outcomes") },
    } },
  });
  const [result] = await module.findFunnelEvidence("website funnel");
  assert.match(result.excerpt, /2000/);
  assert.match(result.excerpt, /Outcome counts and conversion rates withheld/);
  assert.doesNotMatch(result.excerpt, /Among those/);
});
