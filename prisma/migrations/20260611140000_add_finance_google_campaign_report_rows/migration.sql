CREATE TABLE "FinanceGoogleCampaignReportRow" (
  "id" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "periodStart" DATE NOT NULL,
  "periodEnd" DATE NOT NULL,
  "rowOrder" INTEGER NOT NULL DEFAULT 0,
  "campaignId" TEXT,
  "campaign" TEXT NOT NULL,
  "status" TEXT,
  "clicks" INTEGER,
  "costCents" INTEGER,
  "revenueCents" INTEGER,
  "roiPercent" INTEGER,
  "cpcCents" INTEGER,
  "ctrPercent" INTEGER,
  "sales" INTEGER,
  "cpsCents" INTEGER,
  "leads" INTEGER,
  "cplCents" INTEGER,
  "impressions" INTEGER,
  "averageRevenueCents" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinanceGoogleCampaignReportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceGoogleCampaignReport_business_period_row_order_key"
  ON "FinanceGoogleCampaignReportRow"("business", "periodStart", "periodEnd", "rowOrder");

CREATE INDEX "FinanceGoogleCampaignReport_business_period_idx"
  ON "FinanceGoogleCampaignReportRow"("business", "periodStart", "periodEnd");

CREATE INDEX "FinanceGoogleCampaignReport_campaign_id_idx"
  ON "FinanceGoogleCampaignReportRow"("campaignId");
