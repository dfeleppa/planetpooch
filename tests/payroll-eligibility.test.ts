import assert from "node:assert/strict";
import test from "node:test";
import { isPayrollEmployee } from "../src/lib/payroll-eligibility";
import { replacePulledMobileEntries } from "../src/lib/mobile-grooming-import";
import { mobileGroomingCloseoutPreview } from "../src/lib/mobile-grooming-closeout";
import { earnedPayChanges } from "../src/lib/mobile-grooming-post-payout";
import { validateMoegoClockInOutUpload } from "../src/lib/payroll";

test("owner aliases are excluded without excluding similar employee names", () => {
  for (const name of ["Anderson", "Anderson Gonzaga", " ANDERSON  GONZAGA ", "Gonzaga, Anderson"]) {
    assert.equal(isPayrollEmployee(name), false, name);
  }
  for (const name of ["Andrea Lignowski", "Alex Anderson", "Anderson Smith", "Daniel Feleppa"]) {
    assert.equal(isPayrollEmployee(name), true, name);
  }
});

test("a staff refresh removes owner rows from the working payroll without mutating source records", () => {
  const saved = [{ employeeName: "Anderson Gonzaga" }, { employeeName: "Debbie Vesce" }];
  const imported = [{ employeeName: "Anderson" }, { employeeName: "Andrea Lignowski" }];
  assert.deepEqual(replacePulledMobileEntries(saved, imported), [saved[1], imported[1]]);
  assert.equal(saved.length, 2);
  assert.equal(imported.length, 2);
});

test("owner entries, base pay and carried corrections do not affect closeout or its blockers", () => {
  const entry = { serviceDate: new Date("2026-11-14T00:00:00Z"), employeeName: "Andrea Lignowski",
    paymentType: "credit", dogs: 1, priceCents: 10000, upgradeCents: 0, creditCardTipCents: 500, discountCents: 0 };
  const baseline = mobileGroomingCloseoutPreview([entry], [], []);
  const actual = mobileGroomingCloseoutPreview(
    [entry, { ...entry, employeeName: "Anderson Gonzaga", paymentType: "cash" }],
    [{ serviceDate: entry.serviceDate, employeeName: "Anderson Gonzaga", expectedCashCents: 10000, countedCashCents: 9000 }],
    [{ employeeName: "Anderson", amountCents: 50000 }],
    [{ employeeName: "Anderson", amountCents: 1000, note: "old adjustment" }], [],
    [{ employeeName: "Anderson Gonzaga", payKind: "fixed", amountCents: 100000 }],
    [{ employeeName: "Anderson", amountCents: 1000 }],
  );
  assert.deepEqual(actual, baseline);
});

test("ignoring a historical owner payout never creates a negative pay correction", () => {
  assert.deepEqual(earnedPayChanges(
    [{ employeeName: "Anderson Gonzaga", groomerPayCents: 10000 }, { employeeName: "Andrea", groomerPayCents: 10000 }],
    [{ employeeName: "Andrea", groomerPayCents: 12000 }], ["Anderson"],
  ), [{ employeeName: "Andrea", baselinePayCents: 10000, revisedPayCents: 12000, amountCents: 2000 }]);
});

test("owner incomplete shifts do not block imports while employee incomplete shifts still do", () => {
  const upload = { weekStart: "2026-11-08", weekEnd: "2026-11-14", pageSizeText: "100/page", rowCount: 2,
    sourceRows: [{ name: "Anderson Gonzaga", date: "11/09/2026", time: "-" },
      { name: "Andrea", date: "11/09/2026", time: "9am - 5pm" }] };
  assert.equal(validateMoegoClockInOutUpload(upload, upload.weekStart, upload.weekEnd).status, "imported");
  upload.sourceRows[1].time = "-";
  assert.equal(validateMoegoClockInOutUpload(upload, upload.weekStart, upload.weekEnd).status, "needs_review");
});
