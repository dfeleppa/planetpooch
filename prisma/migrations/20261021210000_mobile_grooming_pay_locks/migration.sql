CREATE TABLE "FinanceMobileGroomingPayLock" (
    "id" TEXT NOT NULL,
    "payrollWeekId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "earnedPayCents" INTEGER NOT NULL,
    "weeklyPayCents" INTEGER NOT NULL,
    "cashPayoutCents" INTEGER NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "payoutSnapshot" JSONB NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceMobileGroomingPayLock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingPayLock_payrollWeekId_employeeName_key" ON "FinanceMobileGroomingPayLock"("payrollWeekId", "employeeName");
CREATE INDEX "FinanceMobileGroomingPayLock_payrollWeekId_idx" ON "FinanceMobileGroomingPayLock"("payrollWeekId");
ALTER TABLE "FinanceMobileGroomingPayLock" ADD CONSTRAINT "FinanceMobileGroomingPayLock_payrollWeekId_fkey" FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceMobileGroomingPayLock" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FinanceMobileGroomingPayLock" FROM anon, authenticated;
