-- Add `company` to inventory + maintenance models so each row belongs to
-- exactly one business entity (Pet Resort vs Mobile Grooming). Existing
-- rows are backfilled to GROOMING per product decision.

-- InventoryCategory: drop the global-unique on name, add company column,
-- add (name, company) composite unique so each company can have its own
-- "Cleaning Supplies" without colliding.
ALTER TABLE "InventoryCategory" ADD COLUMN "company" "Company" NOT NULL DEFAULT 'GROOMING';
DROP INDEX IF EXISTS "InventoryCategory_name_key";
CREATE UNIQUE INDEX "InventoryCategory_name_company_key" ON "InventoryCategory"("name", "company");
CREATE INDEX "InventoryCategory_company_idx" ON "InventoryCategory"("company");

ALTER TABLE "InventoryItem" ADD COLUMN "company" "Company" NOT NULL DEFAULT 'GROOMING';
CREATE INDEX "InventoryItem_company_idx" ON "InventoryItem"("company");

ALTER TABLE "MaintenanceSchedule" ADD COLUMN "company" "Company" NOT NULL DEFAULT 'GROOMING';
CREATE INDEX "MaintenanceSchedule_company_idx" ON "MaintenanceSchedule"("company");

ALTER TABLE "MaintenanceTask" ADD COLUMN "company" "Company" NOT NULL DEFAULT 'GROOMING';
CREATE INDEX "MaintenanceTask_company_idx" ON "MaintenanceTask"("company");
