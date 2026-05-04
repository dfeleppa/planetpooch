-- Manual override of the Meta ad-to-Script auto-linker. One row per adId
-- (not per insight row) so the override survives ad renames and re-syncs.
CREATE TABLE "MetaAdScriptOverride" (
    "adId" TEXT NOT NULL,
    "scriptId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "MetaAdScriptOverride_pkey" PRIMARY KEY ("adId")
);

CREATE INDEX "MetaAdScriptOverride_scriptId_idx" ON "MetaAdScriptOverride"("scriptId");

ALTER TABLE "MetaAdScriptOverride" ADD CONSTRAINT "MetaAdScriptOverride_scriptId_fkey"
  FOREIGN KEY ("scriptId") REFERENCES "Script"("id") ON DELETE CASCADE ON UPDATE CASCADE;
