import assert from "node:assert/strict";
import { test } from "node:test";
import { mobileGroomingCloseoutPreview } from "./mobile-grooming-closeout";

const serviceDate = new Date("2026-10-03T00:00:00.000Z");
const entries = [
  { serviceDate, employeeName: "Andrea Groomer", paymentType: "cash", dogs: 2, priceCents: 10_000, upgradeCents: 1_000, discountCents: 500, creditCardTipCents: 300 },
  { serviceDate, employeeName: "Bri Groomer", paymentType: "credit", dogs: 1, priceCents: 8_000, upgradeCents: 0, discountCents: 0, creditCardTipCents: 500 },
];
const reconciliations = [
  { serviceDate, employeeName: "Andrea Groomer", expectedCashCents: 10_500, countedCashCents: 10_300 },
  { serviceDate, employeeName: "Bri Groomer", expectedCashCents: 0, countedCashCents: 0 },
];

test("final deposit uses counted cash after the weekly groomer cash payouts", () => {
  const preview = mobileGroomingCloseoutPreview(entries, reconciliations, [
    { employeeName: "Andrea Groomer", amountCents: 2_000 },
    { employeeName: "Bri Groomer", amountCents: 3_500 },
  ]);
  assert.equal(preview.expectedCashCents, 10_500);
  assert.equal(preview.countedCashCents, 10_300);
  assert.deepEqual(preview.payouts.map(({ groomerPayCents, directDepositCents, cashPayoutCents }) =>
    [groomerPayCents, directDepositCents, cashPayoutCents]
  ), [[4_300, 2_000, 2_300], [3_500, 3_500, 0]]);
  assert.equal(preview.cashPayoutCents, 2_300);
  assert.equal(preview.expectedDepositCents, 8_000);
  assert.deepEqual(preview.missingDays, []);
  assert.deepEqual(preview.staleDays, []);
});

test("an unset deposit and a stale daily cash count remain visible before closeout", () => {
  const changedEntries = [{ ...entries[0], discountCents: 700 }, entries[1]];
  const preview = mobileGroomingCloseoutPreview(changedEntries, reconciliations, [
    { employeeName: "Andrea Groomer", amountCents: 2_000 },
  ]);
  assert.deepEqual(preview.missingDepositSettings, ["Bri Groomer"]);
  assert.deepEqual(preview.staleDays, ["Andrea Groomer — 2026-10-03"]);
});
