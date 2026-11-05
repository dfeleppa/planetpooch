CREATE TABLE "FinancePetResortCashAdjustment" ("id" TEXT PRIMARY KEY, "amountCents" INTEGER NOT NULL CHECK ("amountCents" <> 0), "note" TEXT NOT NULL, "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "recordedById" TEXT NOT NULL, "requestId" TEXT NOT NULL UNIQUE);
CREATE INDEX "FinancePetResortCashAdjustment_recordedAt_idx" ON "FinancePetResortCashAdjustment" ("recordedAt" DESC);
ALTER TABLE "FinancePetResortCashAdjustment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FinancePetResortCashAdjustment" FROM anon, authenticated;
