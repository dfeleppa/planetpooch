-- Add business-context columns to BrandVoiceProfile. Defaults to '' so existing
-- versioned rows backfill cleanly and remain valid.
ALTER TABLE "BrandVoiceProfile"
  ADD COLUMN "targetAudience" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "problemSolved" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "offer" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "offerMechanism" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "pricing" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "beforeAfterState" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "primaryObjections" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "acquisitionChannels" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "growthConstraint" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "uniqueMechanism" TEXT NOT NULL DEFAULT '';
