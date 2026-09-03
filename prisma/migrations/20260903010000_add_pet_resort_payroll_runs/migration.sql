CREATE TABLE "FinancePetResortPayrollRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payrollType" TEXT NOT NULL,
    "checkDate" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "payPeriod" TEXT NOT NULL,
    "schedule" TEXT NOT NULL,
    "payRunAt" TIMESTAMPTZ(6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancePetResortPayrollRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinancePetResortPayrollRun_checkDate_idx"
ON "FinancePetResortPayrollRun"("checkDate");

CREATE INDEX "FinancePetResortPayrollRun_payRunAt_idx"
ON "FinancePetResortPayrollRun"("payRunAt");
