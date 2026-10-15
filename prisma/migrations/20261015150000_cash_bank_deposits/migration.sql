CREATE TABLE "FinanceCashBankDeposit" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "depositedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "recordedById" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  CONSTRAINT "FinanceCashBankDeposit_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinanceCashBankDeposit_positive_amount" CHECK ("amountCents" > 0),
  CONSTRAINT "FinanceCashBankDeposit_source_check" CHECK ("source" IN ('mobile-grooming', 'pet-resort'))
);

CREATE UNIQUE INDEX "FinanceCashBankDeposit_requestId_key" ON "FinanceCashBankDeposit"("requestId");
CREATE INDEX "FinanceCashBankDeposit_source_depositedAt_idx" ON "FinanceCashBankDeposit"("source", "depositedAt" DESC);

-- This ledger is accessed only by the authenticated server-side Prisma client.
ALTER TABLE "FinanceCashBankDeposit" ENABLE ROW LEVEL SECURITY;
