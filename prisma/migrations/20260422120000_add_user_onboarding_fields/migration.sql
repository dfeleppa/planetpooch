-- Add onboarding / HR fields to User
ALTER TABLE "User" ADD COLUMN "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "hireDate" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "department" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "managerId" TEXT;

-- Self-referential FK for manager relation
ALTER TABLE "User" ADD CONSTRAINT "User_managerId_fkey"
  FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_managerId_idx" ON "User"("managerId");
