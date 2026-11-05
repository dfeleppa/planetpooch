CREATE TABLE "ResortStaffSchedule" (
  "weekStart" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "schedule" JSONB NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 1,
  "updatedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResortStaffSchedule_pkey" PRIMARY KEY ("weekStart")
);

ALTER TABLE "ResortStaffSchedule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "ResortStaffSchedule" FROM anon, authenticated;
