ALTER TABLE "FinanceGoogleCampaignReportRow" ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'csv';

CREATE TABLE "GoogleAdsCampaignBusiness" (
    "campaignId" TEXT NOT NULL,
    "campaign" TEXT NOT NULL,
    "business" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GoogleAdsCampaignBusiness_pkey" PRIMARY KEY ("campaignId")
);

CREATE TABLE "GoogleAdsCsvBackup" (
    "id" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleAdsCsvBackup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleAdsCsvBackup_business_periodStart_periodEnd_key" ON "GoogleAdsCsvBackup"("business", "periodStart", "periodEnd");

CREATE TABLE "GoogleAdsSyncWindow" (
    "id" TEXT NOT NULL,
    "from" DATE NOT NULL,
    "to" DATE NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleAdsSyncWindow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GoogleAdsSyncWindow_from_to_key" ON "GoogleAdsSyncWindow"("from", "to");
