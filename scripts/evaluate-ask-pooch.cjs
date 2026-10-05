const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const dataset = JSON.parse(fs.readFileSync(path.join(root, "tests/ask-pooch-evaluation-cases.json"), "utf8"));
const metricSource = fs.readFileSync(path.join(root, "src/lib/knowledge-metric-catalog.ts"), "utf8");
const metricIds = new Set([...metricSource.matchAll(/\{ id: "([^"]+)", report:/g)].map((match) => match[1]));
const command = process.argv[2] ?? "check";

function checkDataset() {
  const ids = new Set();
  for (const item of [...dataset.planCases, ...dataset.answerCases]) {
    if (!item.id || ids.has(item.id)) throw new Error(`Missing or duplicate case ID: ${item.id}`);
    ids.add(item.id);
    if (!item.question?.trim()) throw new Error(`Question missing for ${item.id}`);
  }
  for (const item of dataset.planCases) {
    if (!Array.isArray(item.metrics) || typeof item.analysis !== "boolean") throw new Error(`Invalid plan expectation: ${item.id}`);
    for (const metric of item.metrics) if (!metricIds.has(metric)) throw new Error(`Unknown metric ${metric} in ${item.id}`);
  }
  for (const item of dataset.answerCases) {
    if (!item.sources?.length || !Array.isArray(item.mustContain) || !Array.isArray(item.mustNotContain)) {
      throw new Error(`Invalid answer expectation: ${item.id}`);
    }
  }
  console.log(`Dataset valid: ${dataset.planCases.length} plan cases, ${dataset.answerCases.length} answer cases, ${metricIds.size} catalog metrics.`);
}

function sameItems(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

function score(resultsPath) {
  if (!resultsPath) throw new Error("Use --results=path/to/captured-results.json");
  const results = JSON.parse(fs.readFileSync(path.resolve(resultsPath), "utf8"));
  const planResults = new Map((results.planResults ?? []).map((item) => [item.id, item]));
  const answerResults = new Map((results.answerResults ?? []).map((item) => [item.id, item]));
  if (!planResults.size && !answerResults.size) throw new Error("No captured plan or answer results were supplied.");
  let passed = 0;
  let failed = 0;
  for (const item of dataset.planCases) {
    const actual = planResults.get(item.id);
    if (!actual) continue;
    const actualMetrics = actual.plan?.tasks?.flatMap((task) => task.metricIds ?? []) ?? [];
    const okay = sameItems(actualMetrics, item.metrics) && actual.plan?.needsAnalysis === item.analysis;
    console.log(`${okay ? "PASS" : "FAIL"} plan ${item.id}: expected ${item.metrics.join(",") || "none"}, got ${actualMetrics.join(",") || "none"}`);
    if (okay) passed += 1; else failed += 1;
  }
  for (const item of dataset.answerCases) {
    const actual = answerResults.get(item.id);
    if (!actual) continue;
    const answer = String(actual.answer ?? "");
    const lower = answer.toLowerCase();
    const missing = item.mustContain.filter((value) => !lower.includes(value.toLowerCase()));
    const forbidden = item.mustNotContain.filter((value) => lower.includes(value.toLowerCase()));
    const citations = item.sources.map((_, index) => `[${index + 1}]`).filter((value) => !answer.includes(value));
    const okay = Boolean(answer) && !missing.length && !forbidden.length && !citations.length;
    console.log(`${okay ? "PASS" : "FAIL"} answer ${item.id}${okay ? "" : `: missing=${missing.join(",") || "none"}; forbidden=${forbidden.join(",") || "none"}; citations=${citations.join(",") || "none"}`}`);
    if (okay) passed += 1; else failed += 1;
  }
  if (passed + failed === 0) throw new Error("Captured results did not match any dataset case ID.");
  console.log(`Scored ${passed + failed} captured cases: ${passed} passed, ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

function generateCandidates() {
  const templates = [
    ["website.form_submissions", "How many new-client forms arrived {period}?"],
    ["website.form_submissions", "What was our website lead-form volume {period}?"],
    ["finance.net_sales", "What did Pet Resort sell {period}?"],
    ["finance.estimated_profit", "What profit does the P&L estimate for Pet Resort {period}?"],
    ["kpi.boarding_occupancy", "What share of boarding capacity was used {period}?"],
    ["kpi.daycare_visits", "What was our daycare attendance {period}?"],
    ["payroll.hours", "How many employee hours were logged {period}?"],
    ["ads.leads", "How many Google Ads prospects were reported {period}?"],
    ["ads.cost_per_lead", "What did Meta pay per lead {period}?"],
    ["daycare.inactive_customers", "How large is our dormant daycare outreach pool?"],
  ];
  const periods = ["last week", "last month", "this week"];
  const existing = new Set(dataset.planCases.map((item) => item.question.toLowerCase()));
  const candidates = templates.flatMap(([metric, template], index) => {
    const question = template.replace("{period}", periods[index % periods.length]);
    return existing.has(question.toLowerCase()) ? [] : [{ metric, question }];
  });
  console.log(JSON.stringify({ note: "Review and label these candidates before adding them to the benchmark.", candidates }, null, 2));
}

checkDataset();
if (command === "check") process.exit(0);
if (command === "score") score(process.argv.find((arg) => arg.startsWith("--results="))?.slice(10));
else if (command === "generate") generateCandidates();
else throw new Error("Use: npm run eval:ask-pooch -- check|generate|score --results=path");
