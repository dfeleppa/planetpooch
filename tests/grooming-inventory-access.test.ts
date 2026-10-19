import assert from "node:assert/strict";
import test from "node:test";
import { canEditGroomingCounts } from "../src/lib/grooming-inventory-access";

test("only managers and Stacey's Mobile Grooming account can record counts", () => {
  const stacey = { id: "cmobz2cwb0007k0041qnobqcz", role: "EMPLOYEE", company: "GROOMING" };
  assert.equal(canEditGroomingCounts(stacey), true);
  assert.equal(canEditGroomingCounts({ ...stacey, company: "RESORT" }), false);
  assert.equal(canEditGroomingCounts({ ...stacey, id: "another-user" }), false);
  assert.equal(canEditGroomingCounts({ ...stacey, role: "MARKETING", id: "another-user" }), false);
  assert.equal(canEditGroomingCounts({ ...stacey, role: "MANAGER", id: "another-user" }), true);
  assert.equal(canEditGroomingCounts({ ...stacey, role: "SUPER_ADMIN", id: "another-user" }), true);
  assert.equal(canEditGroomingCounts(null), false);
});
