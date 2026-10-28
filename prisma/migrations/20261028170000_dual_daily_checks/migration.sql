ALTER TABLE "DailyChecklistItem" ADD COLUMN "dualCheck" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DailyChecklistCompletion" ADD COLUMN "slot" TEXT NOT NULL DEFAULT 'SINGLE';
DROP INDEX "DailyChecklistCompletion_itemId_date_key";
CREATE UNIQUE INDEX "DailyChecklistCompletion_itemId_date_slot_key" ON "DailyChecklistCompletion"("itemId", "date", "slot");
ALTER TABLE "DailyChecklistCompletion" ADD CONSTRAINT "DailyChecklistCompletion_slot_check" CHECK ("slot" IN ('SINGLE', 'AM', 'PM'));
