-- CreateTable BrandVoiceProfile (versioned: each save inserts a new row)
CREATE TABLE "BrandVoiceProfile" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "tone" TEXT NOT NULL DEFAULT '',
    "doRules" TEXT NOT NULL DEFAULT '',
    "dontRules" TEXT NOT NULL DEFAULT '',
    "bannedPhrases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "complianceRules" TEXT NOT NULL DEFAULT '',
    "exemplars" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandVoiceProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrandVoiceProfile_version_key" ON "BrandVoiceProfile"("version");
CREATE INDEX "BrandVoiceProfile_version_idx" ON "BrandVoiceProfile"("version");

ALTER TABLE "BrandVoiceProfile" ADD CONSTRAINT "BrandVoiceProfile_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
