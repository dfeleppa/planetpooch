CREATE TABLE "FinanceMobileGroomingDirectDeposit" (
    "id" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "effectiveWeekStart" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingDirectDeposit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingDirectDeposit_employeeName_effectiveWeekStart_key" ON "FinanceMobileGroomingDirectDeposit"("employeeName", "effectiveWeekStart");
CREATE INDEX "FinanceMobileGroomingDirectDeposit_effectiveWeekStart_idx" ON "FinanceMobileGroomingDirectDeposit"("effectiveWeekStart");

CREATE TABLE "FinanceMobileGroomingWeeklyCloseout" (
    "id" TEXT NOT NULL,
    "payrollWeekId" TEXT NOT NULL,
    "countedCashCents" INTEGER NOT NULL,
    "cashPayoutCents" INTEGER NOT NULL,
    "expectedDepositCents" INTEGER NOT NULL,
    "finalDepositCents" INTEGER NOT NULL,
    "varianceCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "sourceFingerprint" TEXT NOT NULL,
    "payoutSnapshot" JSONB NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingWeeklyCloseout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingWeeklyCloseout_payrollWeekId_key" ON "FinanceMobileGroomingWeeklyCloseout"("payrollWeekId");
ALTER TABLE "FinanceMobileGroomingWeeklyCloseout" ADD CONSTRAINT "FinanceMobileGroomingWeeklyCloseout_payrollWeekId_fkey" FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id") ON DELETE CASCADE ON UPDATE CASCADE;
