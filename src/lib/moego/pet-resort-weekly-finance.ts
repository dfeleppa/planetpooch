import {
  streamOrders,
  toCents,
  type MoegoOrderRow,
} from "@/lib/moego/client";
import { BUSINESSES } from "@/lib/business";

export const PET_RESORT_WEEKLY_EXPENSE_CENTS = 1_675_000;
const REVENUE_ORDER_STATUSES = ["COMPLETED", "PROCESSING"] as const;
const PET_RESORT_BUSINESS_ID = BUSINESSES.find(
  (business) => business.key === "pet-resort"
)!.moegoId;

export type WeeklyPetResortRevenue = {
  revenueCents: number;
  orderCount: number;
};

function revenueDate(order: MoegoOrderRow): Date | null {
  const value = order.salesDatetime ?? order.completedTime ?? order.createdTime;
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRevenueOrder(order: MoegoOrderRow): boolean {
  return REVENUE_ORDER_STATUSES.includes(
    order.status as (typeof REVENUE_ORDER_STATUSES)[number]
  );
}

export function summarizeWeeklyPetResortRevenue(
  orders: MoegoOrderRow[],
  start: Date,
  end: Date
): WeeklyPetResortRevenue {
  const countedOrderIds = new Set<string>();
  let revenueCents = 0;

  for (const order of orders) {
    if (!order.id || countedOrderIds.has(order.id) || !isRevenueOrder(order)) {
      continue;
    }
    const date = revenueDate(order);
    if (!date || date < start || date >= end) continue;

    countedOrderIds.add(order.id);
    revenueCents += Math.max(
      0,
      toCents(order.subTotalAmount) - toCents(order.discountAmount)
    );
  }

  return { revenueCents, orderCount: countedOrderIds.size };
}

/**
 * Pull a selected Sunday-Saturday revenue window directly from MoeGo.
 * MoeGo's orders endpoint filters by last-updated time rather than sale time,
 * so the request begins at the sale window and runs through now; the returned
 * orders are then filtered by MoeGo's sale/completion timestamp.
 */
export async function fetchWeeklyPetResortRevenue(
  start: Date,
  end: Date
): Promise<WeeklyPetResortRevenue> {
  const orders: MoegoOrderRow[] = [];
  const queryEnd = new Date(Math.max(end.getTime(), Date.now() + 5 * 60 * 1000));

  for await (const page of streamOrders(
    {
      lastUpdatedTime: {
        startTime: start.toISOString(),
        endTime: queryEnd.toISOString(),
      },
    },
    [PET_RESORT_BUSINESS_ID]
  )) {
    orders.push(...page);
  }

  return summarizeWeeklyPetResortRevenue(orders, start, end);
}
