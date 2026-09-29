import test from "node:test";
import assert from "node:assert/strict";
import { classifyMoegoClientHistory, normalizedPhone, type MoegoClientProfile } from "../src/lib/marketing/moego-client-history";

const submitted = new Date("2026-09-29T16:00:00Z");

function profile(moegoId: string, createdTime: string): MoegoClientProfile {
  return { moegoId, name: "Client", mainPhoneNumber: "516-263-1630", createdTime: new Date(createdTime) };
}

test("phone matching uses exactly the last ten digits", () => {
  assert.equal(normalizedPhone("+1 (516) 263-1630"), "5162631630");
  assert.equal(normalizedPhone("516-263-1630"), "5162631630");
  assert.equal(normalizedPhone("263-1630"), null);
});

test("an older duplicate profile marks the lead as an existing client", () => {
  const history = classifyMoegoClientHistory("5162631630", submitted, [
    profile("new", "2026-09-29T15:00:00Z"),
    profile("old", "2022-03-25T12:00:00Z"),
  ]);
  assert.equal(history.status, "existing");
  assert.equal(history.oldestPriorProfile?.moegoId, "old");
  assert.deepEqual(history.profiles.map((row) => row.moegoId), ["old", "new"]);
});

test("exactly 90 days is recent; a profile created afterward is not pre-existing", () => {
  const cutoff = new Date(submitted.getTime() - 90 * 24 * 60 * 60 * 1000);
  assert.equal(classifyMoegoClientHistory("5162631630", submitted, [profile("boundary", cutoff.toISOString())]).status, "recent");
  assert.equal(classifyMoegoClientHistory("5162631630", submitted, [profile("future", "2026-09-30T12:00:00Z")]).status, "created_after");
});

test("missing phone and absent records remain unverified", () => {
  assert.equal(classifyMoegoClientHistory("123", submitted, []).status, "no_phone");
  assert.equal(classifyMoegoClientHistory("5162631630", submitted, []).status, "no_match");
});
