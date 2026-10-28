ALTER TABLE "DailyChecklistItem" ADD COLUMN "dueWeekday" INTEGER;
ALTER TABLE "DailyChecklistItem" ADD CONSTRAINT "DailyChecklistItem_dueWeekday_check" CHECK ("dueWeekday" BETWEEN 0 AND 6);
ALTER TABLE "DailyChecklistItem" ADD COLUMN "weeklyScheduledAt" TIMESTAMP(3);
