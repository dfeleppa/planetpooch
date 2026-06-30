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

export function dateParamFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function weekHasFinanceYtdBase(weekEnd: string, year: number): boolean {
  return year === WEEKLY_FINANCE_YTD_BASE.year && weekEnd >= WEEKLY_FINANCE_YTD_BASE.weekEnd;
}

export function weekIsFinanceYtdBase(weekEnd: string, year: number): boolean {
  return year === WEEKLY_FINANCE_YTD_BASE.year && weekEnd === WEEKLY_FINANCE_YTD_BASE.weekEnd;
}
