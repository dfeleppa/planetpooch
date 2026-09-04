-- Pet Resort net sales are calculated from synced MoeGo orders again.
-- Keep the legacy column for existing data, but do not require new headline rows to populate it.
ALTER TABLE "FinanceWeeklyKpiHeadline"
  ALTER COLUMN "resortNetSalesCents" DROP NOT NULL;
