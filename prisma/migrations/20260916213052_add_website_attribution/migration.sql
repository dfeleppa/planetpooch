-- Supabase provisioning may precede the app release. The Prisma deployment
-- migration safely adopts the same tables and records its own migration history.
CREATE TABLE IF NOT EXISTS "WebsiteAttributionVisit" (
  "id" UUID PRIMARY KEY,
  "visitorId" UUID NOT NULL,
  "company" "Company" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "landingPage" TEXT NOT NULL,
  "referrerOrigin" TEXT NOT NULL DEFAULT '',
  "campaign" JSONB NOT NULL DEFAULT '{}',
  "clickIds" JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS "WebsiteAttributionVisit_company_createdAt_idx" ON "WebsiteAttributionVisit" ("company", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "WebsiteAttributionVisit_visitorId_createdAt_idx" ON "WebsiteAttributionVisit" ("visitorId", "createdAt");

CREATE TABLE IF NOT EXISTS "WebsiteAttributionRateBucket" (
  "key" TEXT PRIMARY KEY,
  "minute" TIMESTAMP(3) NOT NULL,
  "count" INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS "WebsiteAttributionRateBucket_minute_idx" ON "WebsiteAttributionRateBucket" ("minute");

-- Server-side Prisma only. Neither anonymous nor Supabase-authenticated
-- clients can read or write attribution through the public Data API.
ALTER TABLE "WebsiteAttributionVisit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WebsiteAttributionRateBucket" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "WebsiteAttributionVisit", "WebsiteAttributionRateBucket" FROM PUBLIC, anon, authenticated;
