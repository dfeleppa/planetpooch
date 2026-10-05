const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

function load(relative, dependencies = {}, extras = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(__dirname, "..", relative), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: (name) => dependencies[name] ?? require(name),
    process: { env: { OPENAI_API_KEY: "test-only" } }, Request, Response, Date, console, AbortSignal, ...extras };
  vm.runInNewContext(js, context);
  return context.exports;
}

const policy = load("src/lib/knowledge-answer-policy.ts");
const answerRequest = load("src/lib/knowledge-answer-request.ts", {
  "@/lib/knowledge-chat-models": load("src/lib/knowledge-chat-models.ts"),
  "@/lib/knowledge-answer-policy": policy,
});
const questions = [
  "How did Pet Resort net sales last week compare with the previous week? Give dollar and percentage changes, explain what drove the change, and recommend the top two actions for next week.",
  "Was Pet Resort profitable last week? Show revenue, labor cost, other expenses, profit and margin. What is the biggest opportunity to improve margin?",
  "For Pet Resort, which advertising channel should get more budget next month, Meta or Google Ads? Compare the latest saved month by spend, leads and cost per lead, and explain whether we have enough evidence to judge return on investment.",
  "How many inactive daycare customers could we win back, and what practical reactivation campaign would you recommend? Separate the saved facts from your recommendations.",
  "What was Pet Resort net profit last week, and what net sales would we need next week to achieve a 20% profit margin if estimated expenses stay the same? Show your calculation and assumptions.",
];
const source = { id: "report", title: "Saved report", kind: "record", url: "/finance",
  excerpt: "Saved business evidence", answer: "A single canned fact. [1]", updatedAt: "2026-10-04", dateKind: "entry" };

function chatRoute(fetch, sources = [source]) {
  return load("src/app/api/knowledge/chat/route.ts", {
    "next/server": { NextResponse: Response },
    "@/lib/auth-helpers": { getSession: async () => ({ user: { id: "owner" } }) },
    "@/lib/business": { isBusinessSwitchOriginAllowed: () => true },
    "@/lib/knowledge": { getKnowledgeViewer: async () => ({ id: "owner" }), findKnowledgeSources: async () => sources },
    "@/lib/knowledge-owner": { isKnowledgeOwner: () => true },
    "@/lib/knowledge-app-data": { knowledgeRetrievalQuestion: (messages) => messages.at(-1).content },
    "@/lib/knowledge-chat-models": load("src/lib/knowledge-chat-models.ts"),
    "@/lib/knowledge-answer-policy": policy,
    "@/lib/knowledge-answer-request": answerRequest,
  }, { fetch });
}
const request = (question) => new Request("https://app.planet-pooch.com/api/knowledge/chat", {
  method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
});

for (const question of questions) {
  test(`owner request reaches synthesis instead of returning a canned fragment: ${question}`, async () => {
    let payload;
    const route = chatRoute(async (_url, options) => {
      payload = JSON.parse(options.body);
      return Response.json({ output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Full analysis" }] }] });
    });
    const response = await route.POST(request(question));
    assert.equal(response.status, 200);
    assert.equal((await response.json()).answer, "Full analysis");
    assert.match(payload.input.at(-1).content, /Saved business evidence/);
    assert.ok(payload.input.at(-1).content.includes(question));
    assert.match(payload.instructions, /clearly labeled recommendations/);
    assert.match(payload.instructions, /Missing data is not zero/);
  });
}

test("simple report lookup still returns its verified answer without an API call", async () => {
  const route = chatRoute(async () => assert.fail("Simple lookup should not call model"));
  assert.equal((await (await route.POST(request("What was Pet Resort net sales last week?"))).json()).answer, source.answer);
});

test("synthesis receives every metric from a multi-report plan", async () => {
  let payload;
  const reportPlan = { tasks: [
    { metricIds: ["website.form_submissions"], report: "forms", question: "forms" },
    { metricIds: ["finance.net_sales"], report: "profit-loss", question: "sales" },
  ], needsAnalysis: true };
  const route = chatRoute(async (_url, options) => {
    payload = JSON.parse(options.body);
    return Response.json({ output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Both facts [1] [2]" }] }] });
  }, [{ ...source, answer: undefined, reportPlan, retrievalPath: "semantic-report" },
    { ...source, id: "second", answer: undefined, reportPlan, retrievalPath: "semantic-report" }]);
  const response = await route.POST(request("How many lead forms and how much net sales last week?"));
  const result = await response.json();
  assert.match(payload.input.at(-1).content, /website\.form_submissions, finance\.net_sales/);
  assert.equal(result.retrievalPath, "semantic-report");
  assert.equal(result.reportPlan.tasks.length, 2);
});

test("a detailed generated answer does not prevent the next user question", async () => {
  const longAnswer = "Sourced facts and recommendations. ".repeat(100);
  let payload;
  const route = chatRoute(async (_url, options) => {
    payload = JSON.parse(options.body);
    return Response.json({ output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "Follow-up analysis" }] }] });
  });
  const response = await route.POST(new Request("https://app.planet-pooch.com/api/knowledge/chat", {
    method: "POST", body: JSON.stringify({ messages: [
      { role: "user", content: questions[0] },
      { role: "assistant", content: longAnswer },
      { role: "user", content: questions[3] },
    ] }),
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).answer, "Follow-up analysis");
  assert.equal(payload.input[1].content, longAnswer.trim());
});

test("question and history sizes remain bounded independently", async () => {
  const route = chatRoute(async () => assert.fail("Invalid input must not reach model"));
  assert.equal((await route.POST(request("x".repeat(2001)))).status, 400);
  const response = await route.POST(new Request("https://app.planet-pooch.com/api/knowledge/chat", {
    method: "POST", body: JSON.stringify({ messages: [
      { role: "assistant", content: "x".repeat(16001) },
      { role: "user", content: questions[0] },
    ] }),
  }));
  assert.equal(response.status, 400);
});

function profitReport({ priorRevenue = 2000000, synced = true } = {}) {
  const queries = [];
  const current = { start: "2026-09-27", end: "2026-10-03", label: "week ending 2026-10-03", kind: "week" };
  const business = { key: "pet-resort", label: "Pet Resort", moegoId: "resort" };
  return { queries, module: load("src/lib/knowledge-report-profit-loss.ts", {
    "@/lib/business": { BUSINESSES: [business] },
    "@/lib/business-server": { getActiveBusiness: async () => business },
    "@/lib/knowledge-finance": { quarterRevenueRange: () => null },
    "@/lib/knowledge-report-period": { completedReportWeeks: () => [current], reportPeriod: () => current },
    "@/lib/marketing/submission-date-range": { formatEasternDate: (date) => date.toISOString().slice(0, 10) },
    "@/lib/prisma": { prisma: { moegoSyncState: { findUnique: async () => synced ? {
      lastSyncedAt: new Date("2026-10-04"), updatedAt: new Date("2026-10-04"),
    } : null } } },
    "@/lib/moego/profit-loss-totals": { getProfitLossTotals: async (id, from, to) => {
      queries.push({ id, from: from.toISOString(), to: to.toISOString() });
      const revenueCents = from.toISOString().startsWith("2026-09-27") ? 1909950 : priorRevenue;
      return { revenueCents, expenseCents: 1650000, profitCents: revenueCents - 1650000, orders: 100 };
    } },
  }) };
}

test("sales comparison retrieves both full weeks and supplies dollar and percentage changes", async () => {
  const { module, queries } = profitReport();
  const [result] = await module.findProfitLossReport(questions[0]);
  assert.equal(queries.length, 2);
  assert.equal(queries[0].from, "2026-09-27T00:00:00.000Z");
  assert.equal(queries[0].to, "2026-10-04T00:00:00.000Z");
  assert.equal(queries[1].from, "2026-09-20T00:00:00.000Z");
  assert.equal(queries[1].to, "2026-09-27T00:00:00.000Z");
  assert.match(result.excerpt, /\$19,099\.50/);
  assert.match(result.excerpt, /-\$900\.50/);
  assert.match(result.excerpt, /-4\.5%/);
  assert.match(result.excerpt, /do not establish why/);
});

test("zero comparison denominator and absent sync do not fabricate growth", async () => {
  const zero = await profitReport({ priorRevenue: 0 }).module.findProfitLossReport(questions[0]);
  assert.match(zero[0].excerpt, /percentage change undefined/);
  const missing = await profitReport({ synced: false }).module.findProfitLossReport(questions[0]);
  assert.match(missing[0].excerpt, /cannot verify/);
  assert.doesNotMatch(missing[0].excerpt, /19,099/);
});

test("profitability evidence explicitly distinguishes estimates from actual costs", async () => {
  const [result] = await profitReport().module.findProfitLossReport(questions[1]);
  assert.match(result.excerpt, /net sales \$19,099\.50/);
  assert.match(result.excerpt, /fixed planning estimate/);
  assert.match(result.excerpt, /Actual labor and other expenses cannot be inferred/);
});

test("profitability retrieval supplies both P&L and payroll evidence", async () => {
  let payrollQuestion;
  const reports = load("src/lib/knowledge-reports.ts", {
    "@/lib/knowledge-app-data": { findAppDataSources: async (question) => {
      payrollQuestion = question;
      return [{ ...source, id: "record:payroll-availability:week" }, { ...source, id: "record:unrelated" }];
    } },
    "@/lib/knowledge-kpis": { isKpiQuestion: () => true },
    "@/lib/knowledge-report-profit-loss": profitReport().module,
    "@/lib/knowledge-report-kpis": { isDaycareVisitsPerStaffHourQuestion: () => false, isServiceRevenueTargetQuestion: () => false },
    "@/lib/knowledge-report-ads": {},
    "@/lib/knowledge-report-payroll-ratio": { isPayrollSalesRatioQuestion: () => false },
    "@/lib/knowledge-report-mobile-sales": { isMobileGroomingSalesPerAppointmentQuestion: () => false },
    "@/lib/knowledge-report-forms": { isFormSubmissionCountQuestion: () => false },
  });
  const results = await reports.findReportSources(questions[1]);
  assert.equal(results.length, 2);
  assert.match(results[0].id, /profit-loss/);
  assert.equal(results[1].id, "record:payroll-availability:week");
  assert.match(payrollQuestion, /last week/);
  assert.match(payrollQuestion, /payroll$/);
});
