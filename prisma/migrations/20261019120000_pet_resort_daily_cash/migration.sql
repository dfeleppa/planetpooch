CREATE TABLE "FinancePetResortDailyCash" (
    "id" TEXT NOT NULL,
    "cashDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "FinancePetResortDailyCash_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinancePetResortDailyCash_positive_amount" CHECK ("amountCents" > 0)
);

CREATE UNIQUE INDEX "FinancePetResortDailyCash_requestId_key" ON "FinancePetResortDailyCash"("requestId");
CREATE INDEX "FinancePetResortDailyCash_cashDate_recordedAt_idx" ON "FinancePetResortDailyCash"("cashDate" DESC, "recordedAt" DESC);
ALTER TABLE "FinancePetResortDailyCash" ENABLE ROW LEVEL SECURITY;
