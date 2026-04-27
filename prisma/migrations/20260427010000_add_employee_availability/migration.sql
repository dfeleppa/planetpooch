-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY');

-- CreateTable EmployeeAvailability
CREATE TABLE "EmployeeAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeAvailability_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeAvailability_userId_dayOfWeek_key"
  ON "EmployeeAvailability"("userId", "dayOfWeek");
CREATE INDEX "EmployeeAvailability_userId_idx" ON "EmployeeAvailability"("userId");

ALTER TABLE "EmployeeAvailability" ADD CONSTRAINT "EmployeeAvailability_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
