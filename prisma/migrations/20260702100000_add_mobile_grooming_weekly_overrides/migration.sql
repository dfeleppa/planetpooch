CREATE TABLE "FinanceMobileGroomingWeeklyOverride" (
  "id" TEXT NOT NULL,
  "payrollWeekId" TEXT NOT NULL,
  "stops" INTEGER NOT NULL DEFAULT 0,
  "dogs" INTEGER NOT NULL DEFAULT 0,
  "pricingCents" INTEGER NOT NULL DEFAULT 0,
  "cashCents" INTEGER NOT NULL DEFAULT 0,
  "creditCardTipCents" INTEGER NOT NULL DEFAULT 0,
  "upgradeCents" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceMobileGroomingWeeklyOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingWeeklyOverride_payrollWeekId_key"
  ON "FinanceMobileGroomingWeeklyOverride"("payrollWeekId");

CREATE INDEX "FinanceMobileGroomingWeeklyOverride_payrollWeekId_idx"
  ON "FinanceMobileGroomingWeeklyOverride"("payrollWeekId");

ALTER TABLE "FinanceMobileGroomingWeeklyOverride"
  ADD CONSTRAINT "FinanceMobileGroomingWeeklyOverride_payrollWeekId_fkey"
  FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
