-- Marketing briefs now carry the inputs needed by both Meta and Google.
ALTER TABLE "MarketingIdea"
  ADD COLUMN "objective" TEXT NOT NULL DEFAULT 'LEADS',
  ADD COLUMN "channels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "offer" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "proof" TEXT NOT NULL DEFAULT '';

CREATE TYPE "AdAssetType" AS ENUM ('META_AD', 'GOOGLE_SEARCH_AD');
CREATE TYPE "AdAssetStatus" AS ENUM ('DRAFT', 'READY', 'LIVE', 'WINNER', 'RETIRED');

CREATE TABLE "AdAsset" (
  "id" TEXT NOT NULL,
  "ideaId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "AdAssetType" NOT NULL,
  "status" "AdAssetStatus" NOT NULL DEFAULT 'DRAFT',
  "content" JSONB NOT NULL,
  "model" TEXT,
  "voiceProfileVersion" INTEGER,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdAsset_ideaId_idx" ON "AdAsset"("ideaId");
CREATE INDEX "AdAsset_type_idx" ON "AdAsset"("type");
CREATE INDEX "AdAsset_status_idx" ON "AdAsset"("status");

ALTER TABLE "AdAsset"
  ADD CONSTRAINT "AdAsset_ideaId_fkey"
  FOREIGN KEY ("ideaId") REFERENCES "MarketingIdea"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdAsset"
  ADD CONSTRAINT "AdAsset_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
