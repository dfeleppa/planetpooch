import assert from "node:assert/strict";
import { test } from "node:test";
import { mobileGroomingCloseoutPreview } from "./mobile-grooming-closeout";
import { currentEasternWeekStart, earnedPayChanges, outstandingPayCorrection, postPayoutBreakdown, reconcilePostPayoutChanges } from "./mobile-grooming-post-payout";

test("adjustment details itemize changed commission, tips, base pay, and earlier corrections", () => {
  const before = { groomerPayCents: 10_000, commissionPayCents: 8_000, creditCardTipCents: 2_000, basePayCents: 2_000, payKind: "additive" };
  const after = { groomerPayCents: 12_000, commissionPayCents: 9_500, creditCardTipCents: 2_500, basePayCents: 2_500, payKind: "additive" };
  assert.deepEqual(postPayoutBreakdown(before, after, 1_200), [
    { reason: "Grooming commission", amountCents: 1_000 },
    { reason: "Credit card tips", amountCents: 500 },
    { reason: "Base pay", amountCents: 500 },
    { reason: "Correction already carried to another pay week", amountCents: -800 },
  ]);
  assert.equal(postPayoutBreakdown({ groomerPayCents: 10_000 }, after, 2_000), null);
});

test("post-payout differences compare earned pay to the original closeout", () => {
  const changes = earnedPayChanges(
    [{ employeeName: "Andrea Groomer", groomerPayCents: 43_000 }, { employeeName: "Bri Groomer", groomerPayCents: 25_000 }],
    [{ employeeName: "Andrea Groomer", groomerPayCents: 45_500 }, { employeeName: "Bri Groomer", groomerPayCents: 23_500 }]
  );
  assert.deepEqual(changes.map((row) => [row.employeeName, row.amountCents]), [
    ["Andrea Groomer", 2_500], ["Bri Groomer", -1_500],
  ]);
  assert.equal(outstandingPayCorrection(2_500, 0), 2_500);
  assert.equal(outstandingPayCorrection(2_500, 2_500), 0); // repeated pull
  assert.equal(outstandingPayCorrection(1_000, 2_500), -1_500); // later reversal
  assert.deepEqual(earnedPayChanges([], [], ["New Groomer"])[0].amountCents, 0);
});

test("a carried correction changes the receiving week's payout, including for staff with no stops", () => {
  const preview = mobileGroomingCloseoutPreview([], [], [], [], [], [], [
    { employeeName: "Andrea Groomer", amountCents: 2_500 },
  ]);
  assert.equal(preview.payouts[0].groomerPayCents, 0);
  assert.equal(preview.payouts[0].priorPeriodAdjustmentCents, 2_500);
  assert.equal(preview.payouts[0].weeklyPayCents, 2_500);
  assert.equal(preview.payouts[0].cashPayoutCents, 2_500);
});

test("the receiving pay week starts Saturday in Eastern time", () => {
  assert.equal(currentEasternWeekStart(new Date("2026-10-25T10:00:00Z")).toISOString().slice(0, 10), "2026-10-24");
  assert.equal(currentEasternWeekStart(new Date("2026-11-01T11:00:00Z")).toISOString().slice(0, 10), "2026-10-31");
  assert.equal(currentEasternWeekStart(new Date("2026-10-24T12:00:00Z")).toISOString().slice(0, 10), "2026-10-24");
});

test("repeat imports do not duplicate a correction; a reversal updates the open receiving week", async () => {
  const rows: Array<{ id: string; sourcePayrollWeekId: string; targetWeekStart: Date; employeeName: string; baselinePayCents: number; revisedPayCents: number; amountCents: number }> = [];
  const prepared = { value: true };
  let currentTargetClosed = false;
  const tx = {
    financeMobileGroomingWeeklyCloseout: { findUnique: async () => ({ payoutSnapshot: [{ employeeName: "Andrea", groomerPayCents: 3_800 }] }) },
    financeMobileGroomingPayLock: { findMany: async () => [], findFirst: async () => null },
    financeMobileGroomingPayRule: { findMany: async () => [] },
    financeMobileGroomingPostPayoutAdjustment: {
      findMany: async () => [...rows],
      create: async ({ data }: { data: typeof rows[number] }) => { rows.push({ ...data, id: "one" }); },
      update: async ({ where, data }: { where: { id: string }; data: Partial<typeof rows[number]> }) => {
        Object.assign(rows.find((row) => row.id === where.id)!, data);
      },
    },
    financePayrollWeek: { findUnique: async ({ where }: { where: { business_weekStart: { weekStart: Date } } }) =>
      currentTargetClosed && where.business_weekStart.weekStart.toISOString().slice(0, 10) === "2026-10-24"
        ? { mobileGroomingCloseout: { id: "closed" } } : null },
    financeMobileGroomingPayPreparation: { updateMany: async () => { prepared.value = false; } },
  } as unknown as Parameters<typeof reconcilePostPayoutChanges>[0];
  const entry = (tipCents: number) => [{
    serviceDate: new Date("2026-10-10T00:00:00.000Z"), employeeName: "Andrea", paymentType: "credit",
    dogs: 1, priceCents: 10_000, upgradeCents: 0, creditCardTipCents: tipCents, discountCents: 0,
  }];
  const sourceStart = new Date("2026-10-10T00:00:00.000Z");
  const now = new Date("2026-10-25T10:00:00.000Z");
  await reconcilePostPayoutChanges(tx, "source", sourceStart, entry(500), now);
  assert.equal(rows[0].amountCents, 500);
  assert.equal(rows[0].targetWeekStart.toISOString().slice(0, 10), "2026-10-24");
  assert.equal(prepared.value, false);
  await reconcilePostPayoutChanges(tx, "source", sourceStart, entry(500), now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amountCents, 500);
  await reconcilePostPayoutChanges(tx, "source", sourceStart, entry(0), now);
  assert.equal(rows[0].amountCents, 0);
  currentTargetClosed = true;
  await reconcilePostPayoutChanges(tx, "source", sourceStart, entry(1_000), now);
  assert.equal(rows[1].targetWeekStart.toISOString().slice(0, 10), "2026-10-31");
  assert.equal(rows[1].amountCents, 1_000);
});

test("an employee lock detects later pay without a weekly closeout", async () => {
  const rows: Array<{ id: string; targetWeekStart: Date; employeeName: string; amountCents: number }> = [];
  const tx = {
    financeMobileGroomingWeeklyCloseout: { findUnique: async () => null },
    financeMobileGroomingPayLock: {
      findMany: async () => [{ employeeName: "Andrea", earnedPayCents: 3_800 }],
      findFirst: async () => null,
    },
    financeMobileGroomingPayRule: { findMany: async () => [] },
    financeMobileGroomingPostPayoutAdjustment: {
      findMany: async () => [...rows],
      create: async ({ data }: { data: typeof rows[number] }) => { rows.push({ ...data, id: "one" }); },
    },
    financePayrollWeek: { findUnique: async () => null },
    financeMobileGroomingPayPreparation: { updateMany: async () => {} },
  } as unknown as Parameters<typeof reconcilePostPayoutChanges>[0];
  const result = await reconcilePostPayoutChanges(tx, "source", new Date("2026-10-10T00:00:00.000Z"), [{
    serviceDate: new Date("2026-10-10T00:00:00.000Z"), employeeName: "Andrea", paymentType: "credit",
    dogs: 1, priceCents: 10_000, upgradeCents: 0, creditCardTipCents: 500, discountCents: 0,
  }], new Date("2026-10-25T10:00:00.000Z"));
  assert.deepEqual(result, { checkedCount: 1, lockedCount: 1, discrepancyCount: 1 });
  assert.equal(rows[0].amountCents, 500);
  assert.equal(rows[0].targetWeekStart.toISOString().slice(0, 10), "2026-10-24");
});

test("a correction skips a receiving week after that employee's pay is locked", async () => {
  const rows: Array<{ targetWeekStart: Date; amountCents: number }> = [];
  const tx = {
    financeMobileGroomingWeeklyCloseout: { findUnique: async () => null },
    financeMobileGroomingPayLock: {
      findMany: async () => [{ employeeName: "Andrea", earnedPayCents: 3_800 }],
      findFirst: async ({ where }: { where: { payrollWeekId: string } }) =>
        where.payrollWeekId === "receiving-week" ? { id: "paid" } : null,
    },
    financeMobileGroomingPayRule: { findMany: async () => [] },
    financeMobileGroomingPostPayoutAdjustment: {
      findMany: async () => [],
      create: async ({ data }: { data: typeof rows[number] }) => { rows.push(data); },
    },
    financePayrollWeek: { findUnique: async ({ where }: { where: { business_weekStart: { weekStart: Date } } }) =>
      where.business_weekStart.weekStart.toISOString().slice(0, 10) === "2026-10-24"
        ? { id: "receiving-week", mobileGroomingCloseout: null } : null },
    financeMobileGroomingPayPreparation: { updateMany: async () => {} },
  } as unknown as Parameters<typeof reconcilePostPayoutChanges>[0];
  await reconcilePostPayoutChanges(tx, "source", new Date("2026-10-10T00:00:00.000Z"), [{
    serviceDate: new Date("2026-10-10T00:00:00.000Z"), employeeName: "Andrea", paymentType: "credit",
    dogs: 1, priceCents: 10_000, upgradeCents: 0, creditCardTipCents: 500, discountCents: 0,
  }], new Date("2026-10-25T10:00:00.000Z"));
  assert.equal(rows[0].targetWeekStart.toISOString().slice(0, 10), "2026-10-31");
  assert.equal(rows[0].amountCents, 500);
});
