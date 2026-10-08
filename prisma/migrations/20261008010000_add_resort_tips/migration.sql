CREATE TABLE "FinanceResortTipRun" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payDate" DATE NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FinanceResortTipRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceResortTipRun_payDate_idx" ON "FinanceResortTipRun"("payDate");

CREATE TABLE "FinanceResortTipAllocation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipRunId" UUID NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "hoursHundredths" INTEGER NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "FinanceResortTipAllocation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceResortTipAllocation_tipRunId_employeeId_key" ON "FinanceResortTipAllocation"("tipRunId", "employeeId");
ALTER TABLE "FinanceResortTipAllocation" ADD CONSTRAINT "FinanceResortTipAllocation_tipRunId_fkey" FOREIGN KEY ("tipRunId") REFERENCES "FinanceResortTipRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
