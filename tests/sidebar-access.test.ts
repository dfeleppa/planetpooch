import assert from "node:assert/strict";
import { test } from "node:test";
import { canSeeCorporateSidebar, sidebarBusinesses } from "../src/lib/sidebar-access";

test("sidebar category access follows Corporate assignment and the three named accounts", () => {
  const cases = [
    { user: { id: "corporate", company: "CORPORATE" }, corporate: true, businesses: ["RESORT", "GROOMING"] },
    { user: { id: "cmoc059wd000rjr04x03j7h19", company: "RESORT" }, corporate: false, businesses: ["RESORT"] },
    { user: { id: "cmoc0283w000jjr04200pulk3", company: "RESORT" }, corporate: false, businesses: ["RESORT"] },
    { user: { id: "cmobz2cwb0007k0041qnobqcz", company: "GROOMING" }, corporate: false, businesses: ["GROOMING"] },
    { user: { id: "other-resort", company: "RESORT" }, corporate: false, businesses: [] },
    { user: { id: "other-groomer", company: "GROOMING" }, corporate: false, businesses: [] },
    { user: { id: "unknown", company: null }, corporate: false, businesses: [] },
    { user: undefined, corporate: false, businesses: [] },
  ];
  for (const { user, corporate, businesses } of cases) {
    // Elevated roles or job titles must never bypass the category allowlist.
    for (const role of ["EMPLOYEE", "MANAGER", "SUPER_ADMIN"]) {
      const identity = user ? { ...user, role, jobTitle: "CMO" } : user;
      assert.equal(canSeeCorporateSidebar(identity), corporate);
      assert.deepEqual(sidebarBusinesses(identity).map(({ company }) => company), businesses);
    }
  }
});

test("named exceptions require the saved business assignment", () => {
  assert.deepEqual(sidebarBusinesses({ id: "cmoc059wd000rjr04x03j7h19", company: "GROOMING" }), []);
  assert.deepEqual(sidebarBusinesses({ id: "cmoc0283w000jjr04200pulk3", company: null }), []);
  assert.deepEqual(sidebarBusinesses({ id: "cmobz2cwb0007k0041qnobqcz", company: "RESORT" }), []);
});
