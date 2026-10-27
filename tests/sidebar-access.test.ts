import assert from "node:assert/strict";
import { test } from "node:test";
import { canSeeCorporateSidebar, sidebarBusinesses } from "../src/lib/sidebar-access";
import { homePageFor } from "../src/lib/home-page";

test("managers see their assigned business independently of account ID", () => {
  for (const company of ["RESORT", "GROOMING"]) {
    const user = { id: "any-manager", role: "MANAGER", company };
    assert.equal(canSeeCorporateSidebar(user), false);
    assert.deepEqual(sidebarBusinesses(user).map(b => b.company), [company]);
  }
  assert.deepEqual(sidebarBusinesses({ role: "MANAGER", company: null }), []);
});

test("former named Resort exceptions no longer grant employee access", () => {
  for (const id of ["cmoc059wd000rjr04x03j7h19", "cmoc0283w000jjr04200pulk3", "other-employee"]) {
    const user = { id, role: "EMPLOYEE", company: "RESORT" };
    assert.deepEqual(sidebarBusinesses(user), []);
    assert.equal(homePageFor(user), "/dashboard");
    assert.deepEqual(sidebarBusinesses({ ...user, role: "MANAGER" }).map(b => b.company), ["RESORT"]);
  }
});

test("Corporate and Stacey access remains unchanged", () => {
  const corporate = { role: "EMPLOYEE", company: "CORPORATE" };
  assert.equal(canSeeCorporateSidebar(corporate), true);
  assert.deepEqual(sidebarBusinesses(corporate).map(b => b.company), ["RESORT", "GROOMING"]);
  const stacey = { id: "cmobz2cwb0007k0041qnobqcz", role: "EMPLOYEE", company: "GROOMING" };
  assert.deepEqual(sidebarBusinesses(stacey).map(b => b.company), ["GROOMING"]);
  assert.deepEqual(sidebarBusinesses({ ...stacey, company: "RESORT" }), []);
  assert.deepEqual(sidebarBusinesses(undefined), []);
});

test("only Resort managers gain the operations landing page", () => {
  assert.equal(homePageFor({ role: "MANAGER", company: "RESORT" }), "/maintenance/checklists?company=RESORT");
  for (const company of ["GROOMING", "CORPORATE", null]) {
    assert.equal(homePageFor({ role: "MANAGER", company }), "/dashboard");
  }
  assert.equal(homePageFor({ role: "EMPLOYEE", company: "RESORT" }), "/dashboard");
  assert.equal(homePageFor(undefined), "/dashboard");
});
