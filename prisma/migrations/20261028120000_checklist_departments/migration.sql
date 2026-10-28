ALTER TABLE "DailyChecklistItem" ADD COLUMN "department" TEXT NOT NULL DEFAULT 'BOARDING';
CREATE INDEX "DailyChecklistItem_department_period_isActive_idx" ON "DailyChecklistItem"("department", "period", "isActive");
