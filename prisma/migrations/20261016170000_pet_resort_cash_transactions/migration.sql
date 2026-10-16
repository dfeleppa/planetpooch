CREATE TABLE "FinancePetResortCashTransaction" (
  "id" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "transactionAt" TIMESTAMP(3) NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "transactionType" TEXT NOT NULL,
  "invoiceId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "importedById" TEXT NOT NULL,
  CONSTRAINT "FinancePetResortCashTransaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FinancePetResortCashTransaction_type_check" CHECK ("transactionType" IN ('Sale', 'Refund')),
  CONSTRAINT "FinancePetResortCashTransaction_amount_check" CHECK (("transactionType" = 'Sale' AND "amountCents" > 0) OR ("transactionType" = 'Refund' AND "amountCents" < 0))
);

CREATE UNIQUE INDEX "FinancePetResortCashTransaction_fingerprint_key" ON "FinancePetResortCashTransaction"("fingerprint");
CREATE INDEX "FinancePetResortCashTransaction_transactionAt_idx" ON "FinancePetResortCashTransaction"("transactionAt" DESC);
ALTER TABLE "FinancePetResortCashTransaction" ENABLE ROW LEVEL SECURITY;
