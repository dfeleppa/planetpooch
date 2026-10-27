/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS regression harness. */
const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const roles = [
  { company: "RESORT", jobTitle: "Daycare Associate" },
  { company: "GROOMING", jobTitle: "Groomer" },
];
const positions = [
  { company: "RESORT", title: "Facility Manager" },
  { company: "GROOMING", title: "Fleet Manager" },
];
const prisma = {
  user: { findMany: async ({ where }) => roles.filter((role) => role.company === where.company) },
  orgPosition: { findMany: async ({ where }) => positions.filter((role) => role.company === where.company) },
};
const source = fs.readFileSync(path.join(__dirname, "../src/lib/module-company.ts"), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2017 } }).outputText;
const loaded = { exports: {} };
new Function("require", "module", "exports", compiled)((id) => {
  assert.equal(id, "./prisma");
  return { prisma };
}, loaded, loaded.exports);

// Evaluate the generated Prisma condition against representative assignment records.
function matches(record, where) {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") return condition.some((branch) => matches(record, branch));
    const value = record[key];
    if (condition === null || typeof condition !== "object") return value === condition;
    if ("in" in condition) return condition.in.includes(value);
    if ("none" in condition) return !value.some((item) => matches(item, condition.none));
    if ("some" in condition) return value.some((item) => matches(item, condition.some));
    return matches(value, condition);
  });
}

test("company module views resolve legacy roles, explicit assignments, direct users, and open modules", async () => {
  const fixtures = [
    { id: "open", jobTitleAssignments: [], userAssignments: [] },
    { id: "legacy-resort", jobTitleAssignments: [{ jobTitle: "Daycare Associate", company: null }], userAssignments: [] },
    { id: "legacy-grooming", jobTitleAssignments: [{ jobTitle: "Groomer", company: null }], userAssignments: [] },
    { id: "unfilled-grooming-role", jobTitleAssignments: [{ jobTitle: "Fleet Manager", company: null }], userAssignments: [] },
    { id: "explicit-resort", jobTitleAssignments: [{ jobTitle: "Manager", company: "RESORT" }], userAssignments: [] },
    { id: "direct-grooming", jobTitleAssignments: [], userAssignments: [{ user: { company: "GROOMING" } }] },
    { id: "corporate", jobTitleAssignments: [{ jobTitle: "CEO", company: "CORPORATE" }], userAssignments: [] },
  ];
  for (const [company, expected] of [
    ["RESORT", ["open", "legacy-resort", "explicit-resort"]],
    ["GROOMING", ["open", "legacy-grooming", "unfilled-grooming-role", "direct-grooming"]],
  ]) {
    const where = await loaded.exports.moduleCompanyWhere(company);
    assert.deepEqual(fixtures.filter((record) => matches(record, where)).map(({ id }) => id), expected);
  }
});
