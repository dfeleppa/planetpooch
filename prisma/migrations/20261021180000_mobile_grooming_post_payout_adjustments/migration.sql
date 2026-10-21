CREATE TABLE "FinanceMobileGroomingPostPayoutAdjustment" (
    "id" TEXT NOT NULL,
    "sourcePayrollWeekId" TEXT NOT NULL,
    "targetWeekStart" DATE NOT NULL,
    "employeeName" TEXT NOT NULL,
    "baselinePayCents" INTEGER NOT NULL,
    "revisedPayCents" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingPostPayoutAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingPostPayoutAdjustment_sourcePayrollWeekId_targetWeekStart_employeeName_key" ON "FinanceMobileGroomingPostPayoutAdjustment"("sourcePayrollWeekId", "targetWeekStart", "employeeName");
CREATE INDEX "FinanceMobileGroomingPostPayoutAdjustment_targetWeekStart_employeeName_idx" ON "FinanceMobileGroomingPostPayoutAdjustment"("targetWeekStart", "employeeName");
ALTER TABLE "FinanceMobileGroomingPostPayoutAdjustment" ADD CONSTRAINT "FinanceMobileGroomingPostPayoutAdjustment_sourcePayrollWeekId_fkey" FOREIGN KEY ("sourcePayrollWeekId") REFERENCES "FinancePayrollWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
