CREATE TABLE "FinanceMobileGroomingCashAdjustment" (
    "id" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,

    CONSTRAINT "FinanceMobileGroomingCashAdjustment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceMobileGroomingCashAdjustment_nonzero_amount" CHECK ("amountCents" <> 0),
    CONSTRAINT "FinanceMobileGroomingCashAdjustment_note_required" CHECK (length(btrim("note")) BETWEEN 1 AND 1000)
);

CREATE UNIQUE INDEX "FinanceMobileGroomingCashAdjustment_requestId_key" ON "FinanceMobileGroomingCashAdjustment"("requestId");
CREATE INDEX "FinanceMobileGroomingCashAdjustment_recordedAt_idx" ON "FinanceMobileGroomingCashAdjustment"("recordedAt" DESC);
ALTER TABLE "FinanceMobileGroomingCashAdjustment" ENABLE ROW LEVEL SECURITY;
