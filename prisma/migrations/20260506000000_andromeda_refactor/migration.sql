-- Andromeda-era script generator refactor.
--
-- Adds: AngleStatus + EmotionalRegister enums, Angle table, new Script fields
-- (angleId, hook, cta, shotList, onScreenTextStyle, musicTone, lengthTarget),
-- Hook.isVariant flag, and BrandVoiceProfile fields (tonalRange,
-- forbiddenTerritory, proofBank, visualIdentityGuardrails).
--
-- All new columns nullable or defaulted, so existing rows are valid post-
-- migration. Existing scripts get angleId=null and the legacy single-body /
-- many-Hook shape continues to render. Existing Hook rows get isVariant=true
-- by default — they were always opener variants, the column just makes that
-- explicit.

-- ── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "AngleStatus" AS ENUM ('DRAFT', 'SELECTED', 'GENERATED', 'DISCARDED');
CREATE TYPE "EmotionalRegister" AS ENUM (
  'FEAR', 'ASPIRATION', 'HUMOR', 'LOGIC',
  'PRIDE', 'CURIOSITY', 'NOSTALGIA', 'COMMUNITY'
);

-- ── BrandVoiceProfile: Andromeda-era columns ────────────────────────────────
ALTER TABLE "BrandVoiceProfile"
  ADD COLUMN "tonalRange"               "EmotionalRegister"[] NOT NULL DEFAULT ARRAY[]::"EmotionalRegister"[],
  ADD COLUMN "forbiddenTerritory"       TEXT NOT NULL DEFAULT '',
  ADD COLUMN "proofBank"                JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "visualIdentityGuardrails" TEXT NOT NULL DEFAULT '';

-- ── Angle table ─────────────────────────────────────────────────────────────
CREATE TABLE "Angle" (
    "id"                  TEXT NOT NULL,
    "ideaId"              TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "emotionalRegister"   "EmotionalRegister" NOT NULL,
    "audiencePocket"      TEXT NOT NULL,
    "coreMessage"         TEXT NOT NULL,
    "visualTreatment"     TEXT NOT NULL,
    "differentiator"      TEXT NOT NULL,
    "status"              "AngleStatus" NOT NULL DEFAULT 'DRAFT',
    "voiceProfileVersion" INTEGER,
    "model"               TEXT,
    "wasEdited"           BOOLEAN NOT NULL DEFAULT false,
    "notes"               TEXT NOT NULL DEFAULT '',
    "createdById"         TEXT,
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Angle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Angle_ideaId_idx"            ON "Angle"("ideaId");
CREATE INDEX "Angle_emotionalRegister_idx" ON "Angle"("emotionalRegister");
CREATE INDEX "Angle_status_idx"            ON "Angle"("status");

ALTER TABLE "Angle" ADD CONSTRAINT "Angle_ideaId_fkey"
  FOREIGN KEY ("ideaId") REFERENCES "MarketingIdea"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Angle" ADD CONSTRAINT "Angle_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Script: angle link + structured fields ──────────────────────────────────
ALTER TABLE "Script"
  ADD COLUMN "angleId"           TEXT,
  ADD COLUMN "hook"              TEXT NOT NULL DEFAULT '',
  ADD COLUMN "cta"               TEXT NOT NULL DEFAULT '',
  ADD COLUMN "shotList"          TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "onScreenTextStyle" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "musicTone"         TEXT NOT NULL DEFAULT '',
  ADD COLUMN "lengthTarget"      TEXT NOT NULL DEFAULT '';

CREATE INDEX "Script_angleId_idx" ON "Script"("angleId");

ALTER TABLE "Script" ADD CONSTRAINT "Script_angleId_fkey"
  FOREIGN KEY ("angleId") REFERENCES "Angle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Hook: variant flag ──────────────────────────────────────────────────────
-- All pre-existing Hook rows were opener variants too — the default keeps
-- them flagged correctly. Post-refactor every Hook is a variant of a
-- Script.hook winner.
ALTER TABLE "Hook"
  ADD COLUMN "isVariant" BOOLEAN NOT NULL DEFAULT true;
