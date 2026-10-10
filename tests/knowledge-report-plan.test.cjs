const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, dependencies = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: (name) => dependencies[name] ?? require(name),
    process: { env: {} }, fetch, AbortSignal, Date, console };
  vm.runInNewContext(js, context);
  return context.exports;
}

const catalog = load("src/lib/knowledge-metric-catalog.ts");
const now = new Date("2026-10-05T16:00:00Z");
const period = (question) => /last month/i.test(question)
  ? { start: "2026-09-01", end: "2026-09-30" }
  : /last week/i.test(question) ? { start: "2026-09-27", end: "2026-10-03" } : null;
const planner = load("src/lib/knowledge-report-plan.ts", {
  "@/lib/knowledge-metric-catalog": catalog,
  "@/lib/knowledge-report-period": { reportPeriod: period },
  "@/lib/marketing/submission-date-range": { formatEasternDate: () => "2026-10-05" },
});

test("semantic report plan accepts lead-form paraphrase and multiple report families", () => {
  const question = "How many lead forms last week, and what were Pet Resort net sales?";
  const plan = planner.validateReportPlan({ tasks: [
    { metricIds: ["website.form_submissions"], question: "How many new form submissions last week for Pet Resort?" },
    { metricIds: ["finance.net_sales"], question: "What were Pet Resort net sales last week?" },
  ], needsAnalysis: false }, question, now);
  assert.equal(plan.tasks.length, 2);
  assert.equal(plan.tasks[0].report, "forms");
  assert.equal(plan.tasks[1].report, "profit-loss");
  assert.equal(plan.needsAnalysis, true);
});

test("semantic report plan rejects changed dates, businesses, and mixed report families", () => {
  const question = "How many lead forms did Pet Resort get last week?";
  const task = { metricIds: ["website.form_submissions"], question: "How many Pet Resort new form submissions last week?" };
  assert.ok(planner.validateReportPlan({ tasks: [task], needsAnalysis: false }, question, now));
  assert.equal(planner.validateReportPlan({ tasks: [{ ...task, question: "How many Pet Resort new form submissions last month?" }], needsAnalysis: false }, question, now), null);
  assert.equal(planner.validateReportPlan({ tasks: [{ ...task, question: "How many Mobile Grooming new form submissions last week?" }], needsAnalysis: false }, question, now), null);
  assert.equal(planner.validateReportPlan({ tasks: [{ ...task, metricIds: ["website.form_submissions", "ads.leads"] }], needsAnalysis: false }, question, now), null);
  assert.equal(planner.validateReportPlan({ tasks: [{ ...task, question: "How many Pet Resort forms last week?" }], needsAnalysis: false }, question, now), null);
  assert.equal(planner.validateReportPlan({ tasks: [{ ...task, question: "How many Pet Resort new form submissions for daycare last week?" }], needsAnalysis: false },
    "How many Pet Resort daycare lead forms last week?", now), null);
});

test("compound questions can use distinct periods and report-specific qualifiers", () => {
  const periods = planner.validateReportPlan({ tasks: [
    { metricIds: ["website.form_submissions"], question: "How many Pet Resort new form submissions last week?" },
    { metricIds: ["finance.net_sales"], question: "What were Pet Resort net sales last month?" },
  ], needsAnalysis: true }, "How many Pet Resort lead forms last week and what were Pet Resort net sales last month?", now);
  assert.equal(periods?.tasks.length, 2);
  const reports = planner.validateReportPlan({ tasks: [
    { metricIds: ["ads.spend"], question: "Compare Pet Resort Google Ads ad spend last month." },
    { metricIds: ["finance.net_sales"], question: "Compare Pet Resort net sales last month." },
  ], needsAnalysis: true }, "Compare Google Ads spend with Pet Resort net sales last month.", now);
  assert.equal(reports?.tasks.length, 2);
});

test("planner uses the catalog and validates a structured model response", async () => {
  let request;
  const plan = await planner.planReportQuestion("How many lead forms last week?", {
    key: "test-only", now,
    fetcher: async (_url, options) => {
      request = JSON.parse(options.body);
      return Response.json({ output: [{ type: "message", role: "assistant", content: [{
        type: "output_text", text: JSON.stringify({ tasks: [{ metricIds: ["website.form_submissions"],
          question: "How many new form submissions last week?" }], needsAnalysis: false }),
      }] }] });
    },
  });
  assert.equal(plan.tasks[0].report, "forms");
  assert.match(request.input, /Lead forms without a named ad platform|website\.form_submissions/);
  assert.equal(request.text.format.strict, true);
});

test("comparison wording cannot authorize invented dates", () => {
  assert.equal(planner.validateReportPlan({ tasks: [{ metricIds: ["finance.net_sales"],
    question: "Compare Pet Resort net sales last month." }], needsAnalysis: true },
  "Compare Pet Resort net sales last week.", now), null);
});

test("multi-service plans may split services but cannot drop or invent a qualifier", () => {
  const tasks = [
    { metricIds: ["kpi.service_revenue"], question: "boarding service revenue last week" },
    { metricIds: ["kpi.service_revenue"], question: "training service revenue last week" },
  ];
  const original = "Compare boarding and training service revenue last week";
  assert.equal(planner.validateReportPlan({ tasks, needsAnalysis: true }, original, now)?.tasks.length, 2);
  assert.equal(planner.validateReportPlan({ tasks: tasks.slice(0, 1), needsAnalysis: true }, original, now), null);
  assert.equal(planner.validateReportPlan({ tasks, needsAnalysis: true }, "Compare boarding service revenue last week", now), null);
});

test("owner retrieval combines planned reports and disables canned fragments for analysis", async () => {
  const sources = {
    forms: [{ id: "forms", title: "Forms", kind: "record", url: "/forms", excerpt: "7 forms [1]", answer: "7 forms [1]", updatedAt: now.toISOString(), dateKind: "entry" }],
    "profit-loss": [{ id: "sales", title: "Sales", kind: "record", url: "/finance", excerpt: "$100 net sales [1]", answer: "$100 net sales [1]", updatedAt: now.toISOString(), dateKind: "entry" }],
  };
  const plan = { tasks: [{ report: "forms", metricIds: ["website.form_submissions"], question: "forms" },
    { report: "profit-loss", metricIds: ["finance.net_sales"], question: "sales" }], needsAnalysis: true };
  const knowledge = load("src/lib/knowledge.ts", {
    "@/lib/prisma": { prisma: {} },
    "@/lib/module-visibility": { getVisibleModuleIdsForUser: async () => new Set() },
    "@/lib/auth-helpers": { isManagerOrAbove: () => true, isSuperAdmin: () => true },
    "@/lib/knowledge-app-data": { findAppDataSources: async () => [] },
    "@/lib/knowledge-broad-data": { findBroadAppDataSources: async () => [] },
    "@/lib/knowledge-owner": { isKnowledgeOwner: () => true },
    "@/lib/knowledge-kpis": { isKpiQuestion: () => false },
    "@/lib/knowledge-finance": { quarterRevenueRange: () => null },
    "@/lib/knowledge-reports": { findReportSources: async () => null,
      findReportSourcesForKind: async (kind) => sources[kind] },
    "@/lib/knowledge-report-plan": { planReportQuestion: async () => plan },
    "@/lib/knowledge-evidence-plan": load("src/lib/knowledge-evidence-plan.ts", {
      "@/lib/knowledge-answer-policy": load("src/lib/knowledge-answer-policy.ts"),
      "@/lib/knowledge-report-period": {},
    }),
    "@/lib/knowledge-van-maintenance": { findVanOilChangeSource: async () => null },
  });
  const actual = await knowledge.findKnowledgeSources({ id: "owner" }, "forms and sales");
  assert.deepEqual(Array.from(actual, (source) => source.id), ["forms", "sales"]);
  assert.ok(actual.every((source) => source.answer === undefined));
  assert.ok(actual.every((source) => JSON.stringify(source.reportPlan) === JSON.stringify(plan)));
  assert.ok(actual.every((source) => source.retrievalPath === "semantic-report"));
  assert.ok(actual.every((source) => !source.excerpt.includes("[1]")));
});
