-- CreateEnum Platform
CREATE TYPE "Platform" AS ENUM ('REELS', 'TIKTOK', 'YT_SHORTS', 'META_FEED', 'FB_FEED', 'MULTI');

-- CreateEnum ScriptStatus
CREATE TYPE "ScriptStatus" AS ENUM ('DRAFT', 'APPROVED', 'FILMED', 'POSTED', 'ARCHIVED');

-- CreateEnum HookStatus
CREATE TYPE "HookStatus" AS ENUM ('DRAFT', 'APPROVED', 'REJECTED', 'WINNER');

-- CreateTable Script
CREATE TABLE "Script" (
    "id" TEXT NOT NULL,
    "ideaId" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "platform" "Platform" NOT NULL DEFAULT 'MULTI',
    "status" "ScriptStatus" NOT NULL DEFAULT 'DRAFT',
    "voiceProfileVersion" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Script_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Script_ideaId_idx" ON "Script"("ideaId");
CREATE INDEX "Script_status_idx" ON "Script"("status");

ALTER TABLE "Script" ADD CONSTRAINT "Script_ideaId_fkey"
  FOREIGN KEY ("ideaId") REFERENCES "MarketingIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Script" ADD CONSTRAINT "Script_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable Hook
CREATE TABLE "Hook" (
    "id" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "text" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "status" "HookStatus" NOT NULL DEFAULT 'DRAFT',
    "voiceProfileVersion" INTEGER,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hook_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Hook_scriptId_idx" ON "Hook"("scriptId");

ALTER TABLE "Hook" ADD CONSTRAINT "Hook_scriptId_fkey"
  FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;
