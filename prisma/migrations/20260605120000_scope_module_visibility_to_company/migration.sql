-- Module visibility roles are selected by job title within a company group.
-- Existing rows stay company-null so they continue to match that title in any
-- company until an admin resaves the module visibility with scoped roles.
ALTER TABLE "ModuleJobTitleAssignment"
ADD COLUMN "company" "Company";

DROP INDEX IF EXISTS "ModuleJobTitleAssignment_moduleId_jobTitle_key";

CREATE UNIQUE INDEX "ModuleJobTitleAssignment_moduleId_jobTitle_company_key"
  ON "ModuleJobTitleAssignment"("moduleId", "jobTitle", "company");

CREATE INDEX "ModuleJobTitleAssignment_jobTitle_company_idx"
  ON "ModuleJobTitleAssignment"("jobTitle", "company");
