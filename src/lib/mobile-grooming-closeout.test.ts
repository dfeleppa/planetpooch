import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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

test("signed adjustments change the cash payout and final deposit, with notes retained", () => {
  const settings = [
    { employeeName: "Andrea Groomer", amountCents: 2_000 },
    { employeeName: "Bri Groomer", amountCents: 3_500 },
  ];
  const before = mobileGroomingCloseoutPreview(entries, reconciliations, settings);
  const after = mobileGroomingCloseoutPreview(entries, reconciliations, settings, [
    { employeeName: "Andrea Groomer", amountCents: 1_000, note: "Extra supplies" },
    { employeeName: "Bri Groomer", amountCents: -500, note: "Advance repayment" },
  ]);
  assert.equal(after.adjustmentCents, 500);
  assert.deepEqual(after.payouts.map((payout) => [
    payout.adjustmentCents, payout.adjustmentNote, payout.cashPayoutCents,
  ]), [[1_000, "Extra supplies", 3_300], [-500, "Advance repayment", -500]]);
  assert.equal(after.cashPayoutCents, 2_800);
  assert.equal(after.expectedDepositCents, 7_500);
  assert.notEqual(after.sourceFingerprint, before.sourceFingerprint);
  assert.deepEqual(after.negativeCashPayouts, ["Bri Groomer"]);
});

test("weeks without adjustments retain the existing closeout fingerprint", () => {
  const settings = [
    { employeeName: "Andrea Groomer", amountCents: 2_000 },
    { employeeName: "Bri Groomer", amountCents: 3_500 },
  ];
  const preview = mobileGroomingCloseoutPreview(entries, reconciliations, settings);
  const legacyInput = {
    days: [
      { key: "andrea groomer|2026-10-03", expectedCashCents: 10_500, countedCashCents: 10_300, reconciledExpectedCashCents: 10_500 },
      { key: "bri groomer|2026-10-03", expectedCashCents: 0, countedCashCents: 0, reconciledExpectedCashCents: 0 },
    ],
    payouts: [
      { employeeName: "Andrea Groomer", groomerPayCents: 4_300, directDepositCents: 2_000, cashPayoutCents: 2_300, directDepositSet: true },
      { employeeName: "Bri Groomer", groomerPayCents: 3_500, directDepositCents: 3_500, cashPayoutCents: 0, directDepositSet: true },
    ],
  };
  assert.equal(preview.sourceFingerprint, createHash("sha256").update(JSON.stringify(legacyInput)).digest("hex"));
});

test("a reviewed shortage can reduce only the selected employee's cash payout", () => {
  const settings = [
    { employeeName: "Andrea Groomer", amountCents: 2_000 },
    { employeeName: "Bri Groomer", amountCents: 3_500 },
  ];
  const withoutReview = mobileGroomingCloseoutPreview(entries, reconciliations, settings);
  const applied = mobileGroomingCloseoutPreview(entries, reconciliations, settings, [], [
    { employeeName: "Andrea Groomer", varianceCents: -200, sourceFingerprint: withoutReview.payouts[0].reconciliationFingerprint, applyToCashPayout: true },
    { employeeName: "Bri Groomer", varianceCents: 0, sourceFingerprint: withoutReview.payouts[1].reconciliationFingerprint, applyToCashPayout: false },
  ]);
  assert.deepEqual(applied.pendingVarianceReviews, []);
  assert.equal(applied.payouts[0].groomerPayCents, withoutReview.payouts[0].groomerPayCents);
  assert.equal(applied.payouts[0].cashPayoutCents, withoutReview.payouts[0].cashPayoutCents - 200);
  assert.equal(applied.expectedDepositCents, withoutReview.expectedDepositCents + 200);
  assert.notEqual(applied.sourceFingerprint, withoutReview.sourceFingerprint);

  const excluded = mobileGroomingCloseoutPreview(entries, reconciliations, settings, [], [
    { employeeName: "Andrea Groomer", varianceCents: -200, sourceFingerprint: withoutReview.payouts[0].reconciliationFingerprint, applyToCashPayout: false },
    { employeeName: "Bri Groomer", varianceCents: 0, sourceFingerprint: withoutReview.payouts[1].reconciliationFingerprint, applyToCashPayout: false },
  ]);
  assert.equal(excluded.payouts[0].cashPayoutCents, withoutReview.payouts[0].cashPayoutCents);
  assert.notEqual(excluded.sourceFingerprint, applied.sourceFingerprint);
});

test("a reviewed cash overage can be added to cash payout without changing groomer pay", () => {
  const overageRecords = reconciliations.map((record) => record.employeeName === "Andrea Groomer"
    ? { ...record, countedCashCents: 10_700 } : record);
  const settings = [
    { employeeName: "Andrea Groomer", amountCents: 2_000 },
    { employeeName: "Bri Groomer", amountCents: 3_500 },
  ];
  const before = mobileGroomingCloseoutPreview(entries, overageRecords, settings);
  const after = mobileGroomingCloseoutPreview(entries, overageRecords, settings, [], [
    { employeeName: "Andrea Groomer", varianceCents: 200, sourceFingerprint: before.payouts[0].reconciliationFingerprint, applyToCashPayout: true },
    { employeeName: "Bri Groomer", varianceCents: 0, sourceFingerprint: before.payouts[1].reconciliationFingerprint, applyToCashPayout: false },
  ]);
  assert.equal(after.payouts[0].groomerPayCents, before.payouts[0].groomerPayCents);
  assert.equal(after.payouts[0].cashPayoutCents, before.payouts[0].cashPayoutCents + 200);
  assert.equal(after.expectedDepositCents, before.expectedDepositCents - 200);
});

test("a cash change makes a saved employee variance decision require review again", () => {
  const original = mobileGroomingCloseoutPreview(entries, reconciliations, []);
  const changed = reconciliations.map((record) => record.employeeName === "Andrea Groomer"
    ? { ...record, countedCashCents: 10_200 } : record);
  const preview = mobileGroomingCloseoutPreview(entries, changed, [], [], [
    { employeeName: "Andrea Groomer", varianceCents: -200, sourceFingerprint: original.payouts[0].reconciliationFingerprint, applyToCashPayout: true },
  ]);
  assert.deepEqual(preview.pendingVarianceReviews, ["Andrea Groomer", "Bri Groomer"]);
  assert.equal(preview.payouts[0].variancePayoutCents, 0);
});

test("review becomes stale even when changed cash records leave the variance unchanged", () => {
  const original = mobileGroomingCloseoutPreview(entries, reconciliations, []);
  const changedEntries = entries.map((entry) => entry.employeeName === "Andrea Groomer"
    ? { ...entry, priceCents: entry.priceCents + 100 } : entry);
  const changedRecords = reconciliations.map((record) => record.employeeName === "Andrea Groomer"
    ? { ...record, expectedCashCents: record.expectedCashCents + 100, countedCashCents: record.countedCashCents + 100 }
    : record);
  const preview = mobileGroomingCloseoutPreview(changedEntries, changedRecords, [], [], [
    { employeeName: "Andrea Groomer", varianceCents: -200, sourceFingerprint: original.payouts[0].reconciliationFingerprint, applyToCashPayout: true },
  ]);
  assert.equal(preview.payouts[0].varianceCents, -200);
  assert.equal(preview.payouts[0].varianceReviewed, false);
});
