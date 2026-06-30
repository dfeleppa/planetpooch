ALTER TABLE "FinancePayrollWeek"
  ADD COLUMN "business" TEXT NOT NULL DEFAULT 'pet-resort';

DROP INDEX "FinancePayrollWeek_weekStart_key";
DROP INDEX "FinancePayrollWeek_weekStart_weekEnd_idx";

CREATE UNIQUE INDEX "FinancePayrollWeek_business_weekStart_key"
  ON "FinancePayrollWeek"("business", "weekStart");

CREATE INDEX "FinancePayrollWeek_business_weekStart_weekEnd_idx"
  ON "FinancePayrollWeek"("business", "weekStart", "weekEnd");
