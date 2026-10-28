import test from "node:test";
import assert from "node:assert/strict";
import { replacePulledMobileEntries } from "../src/lib/mobile-grooming-import";

test("whole-staff reconciliation pulls replace old duplicates and remain stable on repeat", () => {
  const appointment = { employeeName: "Andrea Lignowski", priceCents: 10000 };
  const imported = [appointment, { employeeName: "Debbie Vesce", priceCents: 12000 }];
  const once = replacePulledMobileEntries([appointment, appointment], imported, imported.map((row) => row.employeeName));
  assert.deepEqual(once, imported);
  assert.deepEqual(replacePulledMobileEntries(once, imported), imported);
});

test("single employee pull preserves other employees and distinct identical-price appointments", () => {
  const other = { employeeName: "Debbie Vesce", priceCents: 12000 };
  const appointment = { employeeName: "Andrea Lignowski", priceCents: 10000 };
  assert.deepEqual(
    replacePulledMobileEntries([other, { ...appointment, employeeName: " ANDREA  LIGNOWSKI " }], [appointment, appointment]),
    [other, appointment, appointment]
  );
});

test("matched staff with no appointments are cleared; unmatched staff are preserved", () => {
  const unmatched = { employeeName: "Unmatched Employee" };
  assert.deepEqual(replacePulledMobileEntries([{ employeeName: "Andrea" }, unmatched], [], ["Andrea"]), [unmatched]);
});
