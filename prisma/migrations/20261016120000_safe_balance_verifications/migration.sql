CREATE TABLE "SafeBalanceVerification" (
  "id" TEXT NOT NULL,
  "expectedCents" INTEGER NOT NULL,
  "countedCents" INTEGER NOT NULL,
  "varianceCents" INTEGER NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "verifiedById" TEXT NOT NULL,
  "verifiedByName" TEXT NOT NULL,
  "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SafeBalanceVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SafeBalanceVerification_verifiedAt_idx" ON "SafeBalanceVerification"("verifiedAt" DESC);
ALTER TABLE "SafeBalanceVerification" ENABLE ROW LEVEL SECURITY;
