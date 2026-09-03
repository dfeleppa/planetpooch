CREATE TABLE IF NOT EXISTS "FinanceWeeklyKpiHeadline" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "weekStart" DATE NOT NULL,
    "resortNetSalesCents" INTEGER NOT NULL,
    "mobileNetSalesCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceWeeklyKpiHeadline_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "FinanceWeeklyKpiHeadline_weekStart_key"
ON "FinanceWeeklyKpiHeadline"("weekStart");
