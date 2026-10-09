CREATE TABLE "FinanceMobileGroomingDailyReconciliation" (
    "id" TEXT NOT NULL,
    "payrollWeekId" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "employeeName" TEXT NOT NULL,
    "expectedCashCents" INTEGER NOT NULL,
    "countedCashCents" INTEGER NOT NULL,
    "reconciledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingDailyReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingDailyReconciliation_payrollWeekId_employeeName_serviceDate_key" ON "FinanceMobileGroomingDailyReconciliation"("payrollWeekId", "employeeName", "serviceDate");
CREATE INDEX "FinanceMobileGroomingDailyReconciliation_payrollWeekId_serviceDate_idx" ON "FinanceMobileGroomingDailyReconciliation"("payrollWeekId", "serviceDate");

ALTER TABLE "FinanceMobileGroomingDailyReconciliation" ADD CONSTRAINT "FinanceMobileGroomingDailyReconciliation_payrollWeekId_fkey" FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
