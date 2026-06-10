CREATE TABLE "FinanceFacebookCampaignReportRow" (
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

    CONSTRAINT "FinanceFacebookCampaignReportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceFacebookCampaignReportRow_business_periodStart_periodEnd_rowOrder_key" ON "FinanceFacebookCampaignReportRow"("business", "periodStart", "periodEnd", "rowOrder");
CREATE INDEX "FinanceFacebookCampaignReportRow_business_periodStart_periodEnd_idx" ON "FinanceFacebookCampaignReportRow"("business", "periodStart", "periodEnd");
CREATE INDEX "FinanceFacebookCampaignReportRow_campaignId_idx" ON "FinanceFacebookCampaignReportRow"("campaignId");
