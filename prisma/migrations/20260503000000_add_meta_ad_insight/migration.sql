-- Slug pasted into Meta ad names; used at sync time to auto-link insights
-- back to a Script. Unique so we never have two scripts claiming the same ad.
ALTER TABLE "Script" ADD COLUMN "metaAdSlug" TEXT;
CREATE UNIQUE INDEX "Script_metaAdSlug_key" ON "Script"("metaAdSlug");

-- Per-day per-ad insights. Money stored as cents (integer) to avoid float
-- drift. Unique on (adId, date) so re-syncs upsert cleanly.
CREATE TABLE "MetaAdInsight" (
    "id" TEXT NOT NULL,
    "adId" TEXT NOT NULL,
    "adName" TEXT NOT NULL,
    "campaignId" TEXT,
    "campaignName" TEXT,
    "adsetId" TEXT,
    "adsetName" TEXT,
    "date" DATE NOT NULL,
    "spendCents" INTEGER NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER,
    "frequency" DOUBLE PRECISION,
    "linkClicks" INTEGER NOT NULL DEFAULT 0,
    "videoPlays3s" INTEGER,
    "videoThruplays" INTEGER,
    "purchases" INTEGER NOT NULL DEFAULT 0,
    "purchaseValueCents" INTEGER NOT NULL DEFAULT 0,
    "scriptId" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaAdInsight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetaAdInsight_adId_date_key" ON "MetaAdInsight"("adId", "date");
CREATE INDEX "MetaAdInsight_date_idx" ON "MetaAdInsight"("date");
CREATE INDEX "MetaAdInsight_scriptId_idx" ON "MetaAdInsight"("scriptId");

ALTER TABLE "MetaAdInsight" ADD CONSTRAINT "MetaAdInsight_scriptId_fkey"
  FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE SET NULL ON UPDATE CASCADE;
