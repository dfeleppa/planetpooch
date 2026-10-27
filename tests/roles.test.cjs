/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS test harness loads transpiled server helpers with stub dependencies. */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ts = require("typescript");

function load(file, dependencies) {
  const output = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: (name) => {
    if (!(name in dependencies)) throw new Error("Unexpected dependency: " + name);
    return dependencies[name];
  }};
  vm.runInNewContext(output, context);
  return context.exports;
}
const access = load("src/lib/auth-helpers.ts", {
  "next-auth": {}, "./auth": {}, "next/navigation": {}, "@prisma/client": {},
});
test("only current privileged roles grant manager and admin permissions", () => {
  for (const role of ["ADMIN", "MARKETING", "EMPLOYEE", "FRONT_DESK", null, undefined]) {
    assert.equal(access.isManagerOrAbove(role), false);
    assert.equal(access.isSuperAdmin(role), false);
    assert.equal(access.hasMarketingAccess(role), false);
    assert.equal(access.hasModuleManagementAccess(role), false);
  }
  assert.equal(access.isManagerOrAbove("MANAGER"), true);
  assert.equal(access.isSuperAdmin("MANAGER"), false);
  assert.equal(access.isManagerOrAbove("SUPER_ADMIN"), true);
  assert.equal(access.isSuperAdmin("SUPER_ADMIN"), true);
  assert.equal(access.hasMarketingAccess("SUPER_ADMIN"), true);
  assert.equal(access.hasMarketingAccess("MANAGER", "CMO"), true);
});
test("Corporate lifecycle access no longer accepts legacy Admin", () => {
  const people = load("src/lib/people-access.ts", {});
  assert.equal(people.canManageEmployeeLifecycle({ role: "ADMIN", company: "CORPORATE" }), false);
  for (const role of ["SUPER_ADMIN", "MANAGER"]) {
    assert.equal(people.canManageEmployeeLifecycle({ role, company: "CORPORATE" }), true);
  }
});
