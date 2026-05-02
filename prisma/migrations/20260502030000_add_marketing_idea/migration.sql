-- CreateEnum ServiceLine
CREATE TYPE "ServiceLine" AS ENUM ('GROOMING', 'DAYCARE', 'BOARDING', 'TRAINING', 'MULTIPLE');

-- CreateEnum IdeaStatus
CREATE TYPE "IdeaStatus" AS ENUM ('DRAFT', 'IN_PRODUCTION', 'SHIPPED', 'ARCHIVED');

-- CreateTable MarketingIdea
CREATE TABLE "MarketingIdea" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "insight" TEXT NOT NULL DEFAULT '',
    "audience" TEXT NOT NULL DEFAULT '',
    "serviceLine" "ServiceLine" NOT NULL,
    "status" "IdeaStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingIdea_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MarketingIdea_status_idx" ON "MarketingIdea"("status");
CREATE INDEX "MarketingIdea_serviceLine_idx" ON "MarketingIdea"("serviceLine");
CREATE INDEX "MarketingIdea_createdAt_idx" ON "MarketingIdea"("createdAt");

ALTER TABLE "MarketingIdea" ADD CONSTRAINT "MarketingIdea_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
