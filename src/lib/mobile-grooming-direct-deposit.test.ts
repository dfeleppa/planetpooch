import assert from "node:assert/strict";
import { test } from "node:test";
import { directDepositEmployeeKey, latestDirectDeposits } from "./mobile-grooming-direct-deposit";
import { mobileGroomingCloseoutPreview } from "./mobile-grooming-closeout";

const aliases = [
  ["Andrea Lignowski", "Andrea M Lignowski", 40500],
  ["Arielle Schroder", "Arielle T Schroder", 40000],
  ["Debbie Vesce", "Debrah R Vesce", 25005],
  ["Dyana McWherter", "Dyana Mcwheter", 25000],
  ["Jennifer Fischer", "Jennifer A Fischer", 35000],
  ["Stephanie Elezi", "Stephanie A Elezi", 40000],
] as const;

test("MoeGo names retain saved payroll direct deposits", () => {
  const entries = aliases.map(([employeeName]) => ({
    employeeName, serviceDate: new Date("2026-10-24"), paymentType: "cash",
    dogs: 1, priceCents: 200000, upgradeCents: 0, discountCents: 0, creditCardTipCents: 0,
  }));
  const settings = aliases.map(([, employeeName, amountCents]) => ({ employeeName, amountCents }));
  const preview = mobileGroomingCloseoutPreview(entries, [], settings);
  assert.deepEqual(preview.missingDepositSettings, []);
  for (const [name, , amount] of aliases) {
    const payout = preview.payouts.find((row) => row.employeeName === name)!;
    assert.equal(payout.directDepositCents, amount);
    assert.equal(payout.cashPayoutCents, payout.weeklyPayCents - amount);
  }
});

test("latest effective change wins across aliases, including zero, without merging unrelated names", () => {
  const history = [
    { employeeName: "Andrea Lignowski", amountCents: 0, week: "2026-10-31" },
    { employeeName: "Andrea M Lignowski", amountCents: 40500, week: "2026-10-17" },
    { employeeName: "Andrea Other", amountCents: 10000, week: "2026-10-17" },
  ];
  for (const week of ["2026-10-17", "2026-10-24", "2026-10-31", "2026-11-07"]) {
    const settings = latestDirectDeposits(history.filter((row) => row.week <= week));
    assert.equal(settings.length, 2);
    assert.equal(settings.find((row) => directDepositEmployeeKey(row.employeeName) === "andrea m lignowski")!.amountCents,
      week < "2026-10-31" ? 40500 : 0);
  }
  assert.equal(directDepositEmployeeKey("  ANDREA   LIGNOWSKI "), "andrea m lignowski");
  assert.notEqual(directDepositEmployeeKey("Andrea Other"), directDepositEmployeeKey("Andrea Lignowski"));
});
