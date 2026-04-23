-- CreateEnum
CREATE TYPE "OnboardingTaskType" AS ENUM ('ESIGN_REQUEST', 'EMPLOYEE_CONFIRM', 'ADMIN_FILE_UPLOAD', 'ADMIN_TASK');

-- CreateTable OnboardingTemplate
CREATE TABLE "OnboardingTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTemplate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnboardingTemplate_createdById_idx" ON "OnboardingTemplate"("createdById");

ALTER TABLE "OnboardingTemplate" ADD CONSTRAINT "OnboardingTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable OnboardingTemplateTask
CREATE TABLE "OnboardingTemplateTask" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "type" "OnboardingTaskType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL,
    "handbookFileName" TEXT,
    "externalUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingTemplateTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OnboardingTemplateTask_templateId_idx" ON "OnboardingTemplateTask"("templateId");

ALTER TABLE "OnboardingTemplateTask" ADD CONSTRAINT "OnboardingTemplateTask_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "OnboardingTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
