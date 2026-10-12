CREATE TABLE "FinanceMobileGroomingVarianceReview" (
    "id" TEXT NOT NULL,
    "payrollWeekId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "varianceCents" INTEGER NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "applyToCashPayout" BOOLEAN NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingVarianceReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingVarianceReview_payrollWeekId_employeeName_key" ON "FinanceMobileGroomingVarianceReview"("payrollWeekId", "employeeName");
ALTER TABLE "FinanceMobileGroomingVarianceReview" ADD CONSTRAINT "FinanceMobileGroomingVarianceReview_payrollWeekId_fkey" FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
