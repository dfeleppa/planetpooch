CREATE TYPE "ChecklistPeriod" AS ENUM ('AM', 'PM');

CREATE TABLE "DailyChecklistItem" (
  "id" TEXT NOT NULL,
  "period" "ChecklistPeriod" NOT NULL,
  "title" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyChecklistItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DailyChecklistItem_period_isActive_idx"
  ON "DailyChecklistItem"("period", "isActive");

CREATE TABLE "DailyChecklistCompletion" (
  "id" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "completedById" TEXT,
  "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DailyChecklistCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DailyChecklistCompletion_itemId_date_key"
  ON "DailyChecklistCompletion"("itemId", "date");

CREATE INDEX "DailyChecklistCompletion_date_idx"
  ON "DailyChecklistCompletion"("date");

CREATE INDEX "DailyChecklistCompletion_completedById_idx"
  ON "DailyChecklistCompletion"("completedById");

ALTER TABLE "DailyChecklistCompletion"
  ADD CONSTRAINT "DailyChecklistCompletion_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "DailyChecklistItem"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DailyChecklistCompletion"
  ADD CONSTRAINT "DailyChecklistCompletion_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
