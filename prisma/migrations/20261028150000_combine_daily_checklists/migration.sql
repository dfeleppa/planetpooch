BEGIN;
-- Preserve task IDs and their completion records; place AM tasks before PM tasks.
WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "department" ORDER BY CASE "period"::text WHEN 'AM' THEN 0 ELSE 1 END, "order", "createdAt", "id") - 1 AS position
  FROM "DailyChecklistItem" WHERE "period"::text IN ('AM', 'PM')
)
UPDATE "DailyChecklistItem" AS item SET "order" = ranked.position FROM ranked WHERE item."id" = ranked."id";
ALTER TYPE "ChecklistPeriod" RENAME TO "ChecklistPeriod_old";
CREATE TYPE "ChecklistPeriod" AS ENUM ('DAILY', 'WEEKLY');
ALTER TABLE "DailyChecklistItem" ALTER COLUMN "period" TYPE "ChecklistPeriod"
USING (CASE WHEN "period"::text IN ('AM', 'PM') THEN 'DAILY' ELSE "period"::text END)::"ChecklistPeriod";
DROP TYPE "ChecklistPeriod_old";
COMMIT;
