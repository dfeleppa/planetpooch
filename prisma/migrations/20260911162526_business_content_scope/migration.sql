-- AlterTable
ALTER TABLE "BrandVoiceProfile" ADD COLUMN     "company" "Company" NOT NULL DEFAULT 'RESORT';

-- AlterTable
ALTER TABLE "MarketingIdea" ADD COLUMN     "company" "Company" NOT NULL DEFAULT 'RESORT';

-- CreateTable
CREATE TABLE "MetaCampaignBusiness" (
    "campaignId" TEXT NOT NULL,
    "companies" "Company"[] DEFAULT ARRAY[]::"Company"[],

    CONSTRAINT "MetaCampaignBusiness_pkey" PRIMARY KEY ("campaignId")
);

-- CreateIndex
CREATE INDEX "MetaCampaignBusiness_companies_idx" ON "MetaCampaignBusiness" USING GIN ("companies");

-- CreateIndex
CREATE INDEX "BrandVoiceProfile_company_version_idx" ON "BrandVoiceProfile"("company", "version");

-- CreateIndex
CREATE INDEX "MarketingIdea_company_status_idx" ON "MarketingIdea"("company", "status");

-- Existing marketing content belongs to Pet Resort. No employee or training
-- tables are changed. Meta insight rows and the combined finance history remain intact.
-- Only confirmed campaign ownership is seeded; other campaigns stay unassigned
-- until their ownership is reviewed in Marketing > Evaluate Ads.
INSERT INTO "MetaCampaignBusiness" ("campaignId", "companies")
VALUES ('120246124505010779', ARRAY['GROOMING']::"Company"[]);

-- Server-side Prisma access only; do not expose campaign assignments via PostgREST.
ALTER TABLE "MetaCampaignBusiness" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MetaCampaignBusiness" FROM anon, authenticated;