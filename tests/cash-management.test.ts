import assert from "node:assert/strict";
import test from "node:test";
import { petResortCashSummary } from "../src/lib/cash-management";

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
