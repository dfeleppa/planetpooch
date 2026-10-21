import assert from "node:assert/strict";
import test from "node:test";
import { buildMobileCashLedger, cashOnHandCents, mobileGroomingCashSummary, petResortCashSummary } from "../src/lib/cash-management";

test("Mobile Grooming includes unclosed counted cash without counting closed weeks twice", async () => {
  const db = {
    financeMobileGroomingWeeklyCloseout: {
      findMany: async () => [{
        id: "closed-1", countedCashCents: 700_000, cashPayoutCents: 77_880,
        expectedDepositCents: 622_120, finalDepositCents: 622_120, note: "",
        payrollWeek: { weekStart: new Date("2026-10-10"), weekEnd: new Date("2026-10-16") },
      }],
    },
    financeMobileGroomingDailyReconciliation: {
      findMany: async (query: { where: { payrollWeek: { business: string; mobileGroomingCloseout: { is: null } } } }) => {
        assert.deepEqual(query.where, {
          payrollWeek: { business: "mobile-grooming", mobileGroomingCloseout: { is: null } },
        });
        return [{ id: "open-1", serviceDate: new Date("2026-10-20"), reconciledAt: new Date("2026-10-20T14:00:00Z"), employeeName: "Groomer",
          countedCashCents: 339_600,
          payrollWeek: { weekStart: new Date("2026-10-17"), weekEnd: new Date("2026-10-23") } }];
      },
    },
    financeCashBankDeposit: {
      findMany: async () => [],
    },
    financeMobileGroomingCashAdjustment: {
      findMany: async () => [{ id: "adjust-1", amountCents: 10_000, note: "Corrected count", recordedAt: new Date("2026-10-20T16:00:00Z") }],
    },
  } as unknown as Parameters<typeof mobileGroomingCashSummary>[0];

  const summary = await mobileGroomingCashSummary(db);
  assert.equal(summary.pendingCountedCents, 339_600);
  assert.equal(summary.adjustmentCents, 10_000);
  assert.equal(summary.onHandCents, 971_720);
  assert.equal(summary.ledger[0].balanceCents, summary.onHandCents);
  assert.deepEqual(summary.ledger.map((entry) => entry.kind), ["manual", "counted", "completed"]);
});

test("signed cash adjustments change the balance and show their reasons in the ledger", () => {
  const adjustments = [
    { id: "add", amountCents: 2_000, note: "Cash found", recordedAt: new Date("2026-10-19T12:00:00Z") },
    { id: "remove", amountCents: -500, note: "Count correction", recordedAt: new Date("2026-10-20T12:00:00Z") },
  ];
  const ledger = buildMobileCashLedger([], [], [], adjustments);
  assert.deepEqual(ledger.map(({ amountCents, balanceCents, detail }) => ({ amountCents, balanceCents, detail })), [
    { amountCents: -500, balanceCents: 1_500, detail: "Count correction" },
    { amountCents: 2_000, balanceCents: 2_000, detail: "Cash found" },
  ]);
  assert.equal(cashOnHandCents(0, 0, 0, 1_500), ledger[0].balanceCents);
});

test("Mobile Grooming ledger shows net closeout, adjustment, bank removal, and balance after every entry", () => {
  const ledger = buildMobileCashLedger(
    [{ id: "open", serviceDate: new Date("2026-10-20"), reconciledAt: new Date("2026-10-21T14:00:00Z"), employeeName: "Groomer",
      countedCashCents: 5_000, payrollWeek: { weekStart: new Date("2026-10-17"), weekEnd: new Date("2026-10-23") } }],
    [{ id: "closed", countedCashCents: 100_000, cashPayoutCents: 20_000,
      expectedDepositCents: 80_000, finalDepositCents: 79_000, note: "Short $10",
      payrollWeek: { weekStart: new Date("2026-10-10"), weekEnd: new Date("2026-10-16") } }],
    [{ id: "bank", amountCents: 50_000, depositedAt: new Date("2026-10-19T16:00:00Z") }],
  );
  assert.deepEqual(ledger.map(({ kind, amountCents, balanceCents }) => ({ kind, amountCents, balanceCents })), [
    { kind: "counted", amountCents: 5_000, balanceCents: 34_000 },
    { kind: "bank", amountCents: -50_000, balanceCents: 29_000 },
    { kind: "adjustment", amountCents: -1_000, balanceCents: 79_000 },
    { kind: "completed", amountCents: 80_000, balanceCents: 80_000 },
  ]);
  assert.match(ledger[3].detail, /\$1,000\.00 collected − \$200\.00 employee payouts/);
  assert.equal(ledger[0].occurredAt, "2026-10-21T14:00:00.000Z");
  assert.match(ledger[0].detail, /Service date 2026-10-20/);
});

test("Pet Resort daily cash increases the available deposit and remains in the activity log", async () => {
  const db = {
    financePetResortCashTransaction: {
      aggregate: async () => ({ _sum: { amountCents: 10_000 } }),
      count: async () => 2,
    },
    financePetResortDailyCash: {
      aggregate: async () => ({ _sum: { amountCents: 2_500 } }),
      findMany: async () => [{
        id: "daily-1", cashDate: new Date("2026-10-19T00:00:00.000Z"),
        amountCents: 2_500, note: "Front desk cash",
      }],
    },
    financeCashBankDeposit: {
      aggregate: async () => ({ _sum: { amountCents: 3_000 } }),
      findMany: async () => [],
    },
  } as unknown as Parameters<typeof petResortCashSummary>[0];

  const summary = await petResortCashSummary(db);
  assert.equal(summary.onHandCents, 9_500);
  assert.equal(summary.dailyCashCents, 2_500);
  assert.deepEqual(summary.recentDailyCash, [{
    id: "daily-1", cashDate: "2026-10-19", amountCents: 2_500, note: "Front desk cash",
  }]);
});
