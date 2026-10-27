import { test } from "node:test";
import assert from "node:assert/strict";
import { frontDeskRouteAllowed, frontDeskCompanyWhere } from "../src/lib/front-desk-access";
import { availableBusinesses, resolveBusiness } from "../src/lib/business";
import { homePageFor } from "../src/lib/home-page";
import { canSeeCorporateSidebar, sidebarBusinesses } from "../src/lib/sidebar-access";

const user = { id: "front-desk", role: "FRONT_DESK", company: "RESORT" };

test("front desk lands on the resort dashboard and only sees Pet Resort", () => {
  assert.equal(homePageFor(user), "/maintenance/checklists?company=RESORT");
  assert.equal(canSeeCorporateSidebar(user), false);
  assert.deepEqual(sidebarBusinesses(user).map(b => b.company), ["RESORT"]);
  assert.deepEqual(availableBusinesses({ ...user, jobTitle: "CMO" }).map(b => b.company), ["RESORT"]);
  assert.equal(resolveBusiness(user, "GROOMING").company, "RESORT");
  assert.equal(resolveBusiness({ ...user, company: "CORPORATE" }, "GROOMING").company, "RESORT");
  assert.deepEqual(frontDeskCompanyWhere(user), { company: "RESORT" });
  assert.deepEqual(frontDeskCompanyWhere({ role: "MANAGER" }), {});
});

test("allowed screens and operational actions", () => {
  for (const path of ["/maintenance", "/maintenance/checklists", "/maintenance/inventory", "/maintenance/inventory/item", "/maintenance/schedules/id", "/maintenance/tasks/task", "/operations/daycare", "/operations/daycare/packages", "/operations/daycare/expired-packages", "/operations/daycare/not-active", "/api/maintenance/inventory/item", "/api/maintenance/schedules/schedule", "/api/maintenance/tasks/task", "/api/maintenance/checklists/summary"]) {
    assert.equal(frontDeskRouteAllowed(path), true, path);
  }
  for (const path of ["/api/operations/daycare/package-credits", "/api/operations/daycare/expired-packages", "/api/operations/daycare/not-active", "/api/maintenance/checklists/completions", "/api/maintenance/tasks/task/complete"]) {
    assert.equal(frontDeskRouteAllowed(path, "POST"), true, path);
  }
});

test("deny People, employee, Corporate, other business and future routes and APIs", () => {
  for (const path of ["/dashboard", "/career", "/modules", "/admin/employees", "/admin/people", "/admin/dashboard", "/finance/payroll", "/cash-management", "/marketing", "/knowledge", "/maintenance/vans", "/maintenance/vans/6", "/maintenance/schedules/new", "/maintenance/inventory/new", "/maintenance/future", "/operations/future", "/api/employees", "/api/finance/payroll", "/api/knowledge/chat", "/api/business", "/api/maintenance/vans/6", "/api/maintenance/checklists/items"]) {
    for (const method of ["GET", "POST", "PUT", "DELETE"]) assert.equal(frontDeskRouteAllowed(path, method), false, `${method} ${path}`);
  }
  assert.equal(frontDeskRouteAllowed("/api/maintenance/inventory/item", "PUT"), false);
  assert.equal(frontDeskRouteAllowed("/api/maintenance/tasks/task", "PUT"), false);
});
