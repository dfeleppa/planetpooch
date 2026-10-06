CREATE TABLE "MarketingManualSpend" (
  "id" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "amountCents" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingManualSpend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MarketingManualSpend_business_source_periodStart_periodEnd_key"
  ON "MarketingManualSpend"("business", "source", "periodStart", "periodEnd");
