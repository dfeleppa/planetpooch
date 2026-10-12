CREATE TABLE "FinanceMobileGroomingPayoutAdjustment" (
    "id" TEXT NOT NULL,
    "payrollWeekId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingPayoutAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingPayoutAdjustment_payrollWeekId_employeeName_key" ON "FinanceMobileGroomingPayoutAdjustment"("payrollWeekId", "employeeName");
ALTER TABLE "FinanceMobileGroomingPayoutAdjustment" ADD CONSTRAINT "FinanceMobileGroomingPayoutAdjustment_payrollWeekId_fkey" FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
