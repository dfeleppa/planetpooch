CREATE TABLE "FinanceGoogleLsaLeadReportRow" (
  "id" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "rowOrder" INTEGER NOT NULL DEFAULT 0,
  "customer" TEXT,
  "jobType" TEXT,
  "searchIntent" TEXT,
  "location" TEXT,
  "leadType" TEXT,
  "chargeStatus" TEXT,
  "leadReceived" TEXT,
  "lastActivity" TEXT,
  "totalPaidCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceGoogleLsaLeadReportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceGoogleLsaLeadReport_business_period_row_order_key"
  ON "FinanceGoogleLsaLeadReportRow"("business", "periodStart", "periodEnd", "rowOrder");

CREATE INDEX "FinanceGoogleLsaLeadReport_business_period_idx"
  ON "FinanceGoogleLsaLeadReportRow"("business", "periodStart", "periodEnd");

CREATE INDEX "FinanceGoogleLsaLeadReport_customer_idx"
  ON "FinanceGoogleLsaLeadReportRow"("customer");

-- This table contains customer phone numbers and is available only through the
-- authenticated server-side Prisma API, never directly through PostgREST.
ALTER TABLE "FinanceGoogleLsaLeadReportRow" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "FinanceGoogleLsaLeadReportRow" FROM anon, authenticated;
