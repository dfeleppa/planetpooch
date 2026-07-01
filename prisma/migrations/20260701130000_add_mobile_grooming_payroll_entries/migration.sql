CREATE TABLE "FinanceMobileGroomingPayrollEntry" (
  "id" TEXT NOT NULL,
  "payrollWeekId" TEXT NOT NULL,
  "serviceDate" DATE NOT NULL,
  "employeeName" TEXT NOT NULL,
  "paymentType" TEXT NOT NULL,
  "dogs" INTEGER NOT NULL DEFAULT 0,
  "priceCents" INTEGER NOT NULL DEFAULT 0,
  "upgradeQuantity" INTEGER NOT NULL DEFAULT 0,
  "upgradeCents" INTEGER NOT NULL DEFAULT 0,
  "creditCardTipCents" INTEGER NOT NULL DEFAULT 0,
  "discountCents" INTEGER NOT NULL DEFAULT 0,
  "rowOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceMobileGroomingPayrollEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceMobileGroomingPayrollEntry_payrollWeekId_serviceDate_idx"
  ON "FinanceMobileGroomingPayrollEntry"("payrollWeekId", "serviceDate");

CREATE INDEX "FinanceMobileGroomingPayrollEntry_employeeName_idx"
  ON "FinanceMobileGroomingPayrollEntry"("employeeName");

ALTER TABLE "FinanceMobileGroomingPayrollEntry"
  ADD CONSTRAINT "FinanceMobileGroomingPayrollEntry_payrollWeekId_fkey"
  FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
