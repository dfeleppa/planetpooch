import assert from "node:assert/strict";
import test from "node:test";
import {
  PET_RESORT_WEEKLY_EXPENSE_CENTS,
  summarizeWeeklyPetResortRevenue,
} from "../src/lib/moego/pet-resort-weekly-finance";

const start = new Date("2026-09-06T00:00:00.000Z");
const end = new Date("2026-09-13T00:00:00.000Z");

test("Pet Resort uses a fixed $16,750 weekly expense", () => {
  assert.equal(PET_RESORT_WEEKLY_EXPENSE_CENTS, 1_675_000);
});

test("weekly revenue includes unique completed and processing orders in the sale window", () => {
  const orders = [
    {
      id: "completed",
      status: "COMPLETED",
      salesDatetime: "2026-09-07T14:00:00.000Z",
      createdTime: "2026-09-01T00:00:00.000Z",
      subTotalAmount: { units: "100" },
      discountAmount: { units: "10" },
    },
    {
      id: "processing",
      status: "PROCESSING",
      completedTime: "2026-09-12T20:00:00.000Z",
      createdTime: "2026-09-12T20:00:00.000Z",
      subTotalAmount: { units: "50" },
    },
    {
      id: "completed",
      status: "COMPLETED",
      salesDatetime: "2026-09-07T14:00:00.000Z",
      createdTime: "2026-09-01T00:00:00.000Z",
      subTotalAmount: { units: "100" },
    },
    {
      id: "draft",
      status: "DRAFT",
      salesDatetime: "2026-09-08T14:00:00.000Z",
      createdTime: "2026-09-08T14:00:00.000Z",
      subTotalAmount: { units: "999" },
    },
    {
      id: "outside",
      status: "COMPLETED",
      salesDatetime: "2026-09-13T00:00:00.000Z",
      createdTime: "2026-09-13T00:00:00.000Z",
      subTotalAmount: { units: "500" },
    },
  ];

  assert.deepEqual(summarizeWeeklyPetResortRevenue(orders, start, end), {
    revenueCents: 14_000,
    orderCount: 2,
  });
});
