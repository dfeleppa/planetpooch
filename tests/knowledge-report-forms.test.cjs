const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const ts = require("typescript");

const source = fs.readFileSync(path.join(__dirname, "../src/lib/knowledge-report-forms.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;
const businesses = [
  { company: "RESORT", label: "Pet Resort" },
  { company: "GROOMING", label: "Mobile Grooming" },
];
const range = { start: "2026-09-27", end: "2026-10-03",
  startAt: new Date("2026-09-27T04:00:00Z"), endBefore: new Date("2026-10-04T04:00:00Z") };
let where;
const dependencies = {
  "@/lib/prisma": { prisma: { websiteFormSubmission: { count: async (query) => { where = query.where; return 7; } } } },
  "@/lib/business-server": { getActiveBusiness: async () => businesses[1] },
  "@/lib/business": { BUSINESSES: businesses },
  "@/lib/marketing/submission-date-range": { resolveSubmissionDateRange: () => range },
  "@/lib/knowledge-report-period": { reportPeriod: () => ({ start: range.start, end: range.end }) },
};
const context = { exports: {}, require: (name) => dependencies[name] ?? require(name), Date };
vm.runInNewContext(js, context);
const forms = context.exports;

test("lead forms and new form submissions match the same report", () => {
  assert.equal(forms.isFormSubmissionCountQuestion("How many lead forms were submitted last week?"), true);
  assert.equal(forms.isFormSubmissionCountQuestion("How many new form submissions were submitted last week?"), true);
  assert.equal(forms.isFormSubmissionCountQuestion("How many Google Ads lead forms last week?"), false);
  assert.equal(forms.isFormSubmissionCountQuestion("How many daycare lead forms last week?"), false);
});

test("form count uses explicit business, Eastern bounds, and all statuses", async () => {
  const [result] = await forms.findFormSubmissionReport("How many Pet Resort lead forms were submitted last week?");
  assert.equal(where.company, "RESORT");
  assert.equal(where.receivedAt.gte.toISOString(), "2026-09-27T04:00:00.000Z");
  assert.equal(where.receivedAt.lt.toISOString(), "2026-10-04T04:00:00.000Z");
  assert.match(result.answer, /7 new form submissions were received for Pet Resort/);
  assert.match(result.url, /submissionStart=2026-09-27/);
});

test("combined business question counts both company values", async () => {
  const [result] = await forms.findFormSubmissionReport("How many lead forms for both businesses last week?");
  assert.deepEqual(Array.from(where.company.in), ["RESORT", "GROOMING"]);
  assert.match(result.answer, /Pet Resort and Mobile Grooming/);
});

test("service-filtered form count cannot silently use the all-service total", async () => {
  const sources = await forms.findFormSubmissionReport("How many daycare lead forms last week?");
  assert.equal(sources.length, 0);
});
