import test from "node:test";
import assert from "node:assert/strict";
import { countFirstTimeGroomingPets } from "../src/lib/moego/first-time-grooming-pets";
import type { MoegoAppointmentRow } from "../src/lib/moego/client";

function visit(id: string, pets: string[], date = "2026-10-05", service = "Grooming", status = "FINISHED"): MoegoAppointmentRow {
  return { id, customerId: "owner", status, duration: { startTime: `${date}T12:00:00Z` },
    petServiceDetails: pets.map(id => ({ pet: { id, name: "Same Name" }, serviceDetails: [{ name: service }] })) };
}
const count = (history: MoegoAppointmentRow[], cohort: MoegoAppointmentRow[]) =>
  countFirstTimeGroomingPets(history, cohort, s => s.name === "Grooming");

test("counts pets separately within a household and ignores prior daycare", () => {
  const current = visit("current", ["returning", "new", "also-new"]);
  assert.equal(count([visit("old-groom", ["returning"], "2026-09-01"), visit("daycare", ["new"], "2026-09-01", "Daycare")], [current]), 2);
});
test("deduplicates repeat visits and duplicate API rows", () => {
  const first = visit("first", ["pet"]);
  const second = visit("second", ["pet"], "2026-10-06");
  assert.equal(count([first, first, second], [first, second]), 1);
  assert.equal(count([first], [second]), 0);
});
test("canceled, deleted and no-show appointments do not establish prior visits", () => {
  const old = visit("old", ["pet"], "2026-09-01");
  for (const prior of [{ ...old, status: "CANCELED" }, { ...old, isDeleted: true }, { ...old, noShow: true }]) {
    assert.equal(count([prior], [visit("new", ["pet"])]), 1);
  }
});
test("uses service dates regardless of payment timing and input order", () => {
  const first = visit("first", ["pet"], "2026-09-01");
  const later = visit("later", ["pet"]);
  assert.equal(count([later, first], [later]), 0);
  assert.equal(count([later, first], [first]), 1);
});
test("fails instead of inflating first-time counts for unidentifiable pets", () => {
  const broken = visit("broken", ["pet"]);
  broken.petServiceDetails![0].pet!.id = undefined;
  assert.throws(() => count([], [broken]), /stable pet ID/);
  assert.equal(count([], []), 0);
});
