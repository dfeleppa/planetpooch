CREATE TABLE "MarketingCampaignSegment" (
  "source" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "segment" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MarketingCampaignSegment_pkey" PRIMARY KEY ("source", "campaignId"),
  CONSTRAINT "MarketingCampaignSegment_source_check" CHECK ("source" IN ('meta', 'google-ads', 'google-lsa')),
  CONSTRAINT "MarketingCampaignSegment_segment_check" CHECK ("segment" IN ('mobile-grooming', 'in-house-grooming', 'generic-grooming', 'boarding', 'daycare', 'training', 'unassigned'))
);
ALTER TABLE "MarketingCampaignSegment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "MarketingCampaignSegment" FROM anon, authenticated;
