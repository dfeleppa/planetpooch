import assert from "node:assert/strict";
import { test } from "node:test";
import { BUSINESSES, availableBusinesses, businessCookieName, businessFor, businessSwitchPath, employeeBusinessWhere, resolveBusiness, isBusinessSwitchOriginAllowed } from "../src/lib/business";

test("switching accepts the public origin behind Next's internal host and rejects other origins", () => {
  assert.equal(isBusinessSwitchOriginAllowed("http://127.0.0.1:3210", "127.0.0.1:3210"), true);
  assert.equal(isBusinessSwitchOriginAllowed("https://app.planet-pooch.com", "app.planet-pooch.com"), true);
  assert.equal(isBusinessSwitchOriginAllowed("https://attacker.invalid", "app.planet-pooch.com"), false);
  assert.equal(isBusinessSwitchOriginAllowed("null", "app.planet-pooch.com"), false);
  assert.equal(isBusinessSwitchOriginAllowed(null, "app.planet-pooch.com"), false);
  assert.equal(isBusinessSwitchOriginAllowed("http://127.0.0.1:9999", "127.0.0.1:3210"), false);
});

const admin = Object.freeze({ id: "admin", role: "SUPER_ADMIN", company: "CORPORATE" });

test("the selector has exactly the existing two businesses and stable integration keys", () => {
  assert.deepEqual(BUSINESSES.map(({ company, key, moegoId }) => ({ company, key, moegoId })), [
    { company: "RESORT", key: "pet-resort", moegoId: "biz3pcO" },
    { company: "GROOMING", key: "mobile-grooming", moegoId: "bizVdfk" },
  ]);
  for (const legacy of ["RESORT", "pet-resort", "PET_RESORT", "PET_RESORT_COPY"]) assert.equal(businessFor(legacy)?.company, "RESORT");
  for (const legacy of ["GROOMING", "mobile-grooming", "MOBILE_GROOMING"]) assert.equal(businessFor(legacy)?.company, "GROOMING");
});

test("business selection never changes the saved employee identity or company", () => {
  const before = structuredClone(admin);
  assert.equal(resolveBusiness(admin, "GROOMING").company, "GROOMING");
  assert.deepEqual(admin, before);
  assert.equal(businessFor("CORPORATE"), undefined);
  assert.equal(availableBusinesses(admin).length, 2);
  assert.notEqual(businessCookieName("user-1"), businessCookieName("user-2"));
});

test("employee and manager preferences cannot widen their company access", () => {
  for (const role of ["EMPLOYEE", "MANAGER"]) {
    for (const company of ["RESORT", "GROOMING"] as const) {
      const user = { id: "employee", role, company };
      assert.deepEqual(availableBusinesses(user).map((business) => business.company), [company]);
      assert.equal(resolveBusiness(user, company === "RESORT" ? "GROOMING" : "RESORT").company, company);
    }
  }
  assert.deepEqual(employeeBusinessWhere({ id: "manager", role: "MANAGER", company: "RESORT" }, "GROOMING"), { company: { in: [] } });
});

test("corporate records stay accessible without being reassigned to either business", () => {
  for (const company of ["RESORT", "GROOMING"] as const) {
    assert.deepEqual(employeeBusinessWhere(admin, company), { company: { in: [company, "CORPORATE"] } });
    assert.deepEqual(employeeBusinessWhere({ id: "manager", role: "MANAGER", company: "CORPORATE" }, company), { company: { in: ["CORPORATE"] } });
  }
});

test("a switch leaves record forms and clears business-specific filters", () => {
  assert.equal(businessSwitchPath("/admin/employees/unchanged-id?company=RESORT", "GROOMING"), "/admin/employees");
  assert.equal(businessSwitchPath("/maintenance/inventory/new?company=RESORT", "GROOMING"), "/maintenance/inventory");
  assert.equal(businessSwitchPath("/modules/module-id/lessons/lesson-id", "GROOMING"), "/modules");
  assert.equal(businessSwitchPath("/admin/employees?status=terminated&jobTitle=Resort&q=test&company=RESORT", "GROOMING"), "/admin/employees?status=terminated");
});

test("equivalent business routes retain useful report dates", () => {
  assert.equal(businessSwitchPath("/finance/kpis?segment=PET_RESORT_COPY&week=2026-09-06", "GROOMING"), "/finance/kpis?week=2026-09-06");
  assert.equal(businessSwitchPath("/finance/payroll", "GROOMING"), "/finance/payroll/mobile-grooming");
  assert.equal(businessSwitchPath("/finance/payroll/mobile-grooming", "RESORT"), "/finance/payroll");
  assert.equal(businessSwitchPath("/finance/payroll/commissions", "GROOMING"), "/finance/payroll/mobile-grooming");
  assert.equal(businessSwitchPath("/operations/daycare/packages", "GROOMING"), "/maintenance");
  assert.equal(businessSwitchPath("/maintenance/checklists", "GROOMING"), "/maintenance");
});

test("switch destinations cannot redirect outside the app or invoke API routes", () => {
  for (const href of ["https://example.com", "//example.com", "http://[", "/api/employees", "javascript:alert(1)"]) {
    assert.equal(businessSwitchPath(href, "RESORT"), "/dashboard");
  }
});
