export const WEEKLY_FINANCE_YTD_BASE = {
  business: "all-businesses-weekly",
  year: 2026,
  weekEnd: "2026-06-13",
  totalRevenue: 34_064_760,
  totalProfit: -7_448_824,
} as const;

export type FinanceYtdTotals = {
  totalRevenue: number | null;
  totalProfit: number | null;
};

export type WeeklyFinanceMetric = {
  totalRevenue: number | null;
  totalProfit: number | null;
  nonPayrollExpenses: number | null;
  payrollExpenses: number | null;
};

/** New business reports have no inherited balance; absent values stay blank. */
export function sumBusinessFinanceYtd(metrics: WeeklyFinanceMetric[]): FinanceYtdTotals {
  let totalRevenue: number | null = null;
  let totalProfit: number | null = null;
  for (const metric of metrics) {
    if (metric.totalRevenue !== null) totalRevenue = (totalRevenue ?? 0) + metric.totalRevenue;
    if (metric.totalProfit !== null) totalProfit = (totalProfit ?? 0) + metric.totalProfit;
    else if (metric.totalRevenue !== null || metric.nonPayrollExpenses !== null || metric.payrollExpenses !== null) {
      totalProfit = (totalProfit ?? 0) + (metric.totalRevenue ?? 0) - (metric.nonPayrollExpenses ?? 0) - (metric.payrollExpenses ?? 0);
    }
  }
  return { totalRevenue, totalProfit };
}

export function dateParamFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekHasFinanceYtdBase(weekEnd: string, year: number): boolean {
  return year === WEEKLY_FINANCE_YTD_BASE.year && weekEnd >= WEEKLY_FINANCE_YTD_BASE.weekEnd;
}

export function weekIsFinanceYtdBase(weekEnd: string, year: number): boolean {
  return year === WEEKLY_FINANCE_YTD_BASE.year && weekEnd === WEEKLY_FINANCE_YTD_BASE.weekEnd;
}
