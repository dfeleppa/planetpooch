-- CreateTable ModuleJobTitleAssignment
CREATE TABLE "ModuleJobTitleAssignment" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleJobTitleAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleJobTitleAssignment_moduleId_jobTitle_key"
  ON "ModuleJobTitleAssignment"("moduleId", "jobTitle");
CREATE INDEX "ModuleJobTitleAssignment_jobTitle_idx"
  ON "ModuleJobTitleAssignment"("jobTitle");

ALTER TABLE "ModuleJobTitleAssignment" ADD CONSTRAINT "ModuleJobTitleAssignment_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable ModuleUserAssignment
CREATE TABLE "ModuleUserAssignment" (
    "id" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModuleUserAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ModuleUserAssignment_moduleId_userId_key"
  ON "ModuleUserAssignment"("moduleId", "userId");
CREATE INDEX "ModuleUserAssignment_userId_idx"
  ON "ModuleUserAssignment"("userId");

ALTER TABLE "ModuleUserAssignment" ADD CONSTRAINT "ModuleUserAssignment_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ModuleUserAssignment" ADD CONSTRAINT "ModuleUserAssignment_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing module is assigned to every distinct job title that
-- is currently in use, so existing employees keep seeing the same modules they
-- already had access to. New modules created after this migration default to
-- "no assignments" which is treated as "visible to everyone" by the app.
INSERT INTO "ModuleJobTitleAssignment" ("id", "moduleId", "jobTitle")
SELECT
  'mjta_' || replace(gen_random_uuid()::text, '-', ''),
  m."id",
  jt."jobTitle"
FROM "Module" m
CROSS JOIN (
  SELECT DISTINCT "jobTitle"
  FROM "User"
  WHERE "jobTitle" IS NOT NULL AND "jobTitle" <> ''
) jt
ON CONFLICT ("moduleId", "jobTitle") DO NOTHING;
