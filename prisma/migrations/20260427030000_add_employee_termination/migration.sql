-- ============================================================
-- Add termination columns to User
-- ============================================================
ALTER TABLE "User"
  ADD COLUMN "terminatedAt"      TIMESTAMP(3),
  ADD COLUMN "terminationReason" TEXT,
  ADD COLUMN "terminatedById"    TEXT;

CREATE INDEX "User_terminatedAt_idx" ON "User"("terminatedAt");

ALTER TABLE "User" ADD CONSTRAINT "User_terminatedById_fkey"
  FOREIGN KEY ("terminatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================================
-- Restrict → SetNull on actor FKs (with NOT NULL → NULL)
--
-- Each block: drop NOT NULL on the FK column, drop the existing FK constraint,
-- recreate with ON DELETE SET NULL. Naming follows Prisma's `<Table>_<col>_fkey`
-- convention so future `prisma migrate diff` is consistent.
-- ============================================================

-- MaintenanceSchedule.createdById
ALTER TABLE "MaintenanceSchedule" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "MaintenanceSchedule" DROP CONSTRAINT "MaintenanceSchedule_createdById_fkey";
ALTER TABLE "MaintenanceSchedule" ADD CONSTRAINT "MaintenanceSchedule_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MaintenanceTask.assignedToId (already nullable; only swap onDelete)
ALTER TABLE "MaintenanceTask" DROP CONSTRAINT "MaintenanceTask_assignedToId_fkey";
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_assignedToId_fkey"
  FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MaintenanceTask.completedById (already nullable; only swap onDelete)
ALTER TABLE "MaintenanceTask" DROP CONSTRAINT "MaintenanceTask_completedById_fkey";
ALTER TABLE "MaintenanceTask" ADD CONSTRAINT "MaintenanceTask_completedById_fkey"
  FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- InventoryAdjustment.adjustedById
ALTER TABLE "InventoryAdjustment" ALTER COLUMN "adjustedById" DROP NOT NULL;
ALTER TABLE "InventoryAdjustment" DROP CONSTRAINT "InventoryAdjustment_adjustedById_fkey";
ALTER TABLE "InventoryAdjustment" ADD CONSTRAINT "InventoryAdjustment_adjustedById_fkey"
  FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Project.ownerId
ALTER TABLE "Project" ALTER COLUMN "ownerId" DROP NOT NULL;
ALTER TABLE "Project" DROP CONSTRAINT "Project_ownerId_fkey";
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Task.createdById
ALTER TABLE "Task" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Task" DROP CONSTRAINT "Task_createdById_fkey";
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OnboardingTemplate.createdById
ALTER TABLE "OnboardingTemplate" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "OnboardingTemplate" DROP CONSTRAINT "OnboardingTemplate_createdById_fkey";
ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- EsignRequest.requestedById
ALTER TABLE "EsignRequest" ALTER COLUMN "requestedById" DROP NOT NULL;
ALTER TABLE "EsignRequest" DROP CONSTRAINT "EsignRequest_requestedById_fkey";
ALTER TABLE "EsignRequest" ADD CONSTRAINT "EsignRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
