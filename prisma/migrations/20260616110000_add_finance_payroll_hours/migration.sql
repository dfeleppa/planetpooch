CREATE TYPE "PayrollCategory" AS ENUM ('TRAINING', 'GROOMING', 'RESORT');

CREATE TABLE "FinancePayrollWeek" (
  "id" TEXT NOT NULL,
  "weekStart" DATE NOT NULL,
  "weekEnd" DATE NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancePayrollWeek_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinancePayrollEmployeeHours" (
  "id" TEXT NOT NULL,
  "payrollWeekId" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "category" "PayrollCategory" NOT NULL,
  "shifts" INTEGER NOT NULL DEFAULT 0,
  "totalSeconds" INTEGER NOT NULL DEFAULT 0,
  "rowOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FinancePayrollEmployeeHours_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinancePayrollWeek_weekStart_key"
  ON "FinancePayrollWeek"("weekStart");

CREATE INDEX "FinancePayrollWeek_weekStart_weekEnd_idx"
  ON "FinancePayrollWeek"("weekStart", "weekEnd");

CREATE UNIQUE INDEX "FinancePayrollEmployeeHours_payrollWeekId_employeeName_key"
  ON "FinancePayrollEmployeeHours"("payrollWeekId", "employeeName");

CREATE INDEX "FinancePayrollEmployeeHours_payrollWeekId_category_idx"
  ON "FinancePayrollEmployeeHours"("payrollWeekId", "category");

CREATE INDEX "FinancePayrollEmployeeHours_employeeName_idx"
  ON "FinancePayrollEmployeeHours"("employeeName");

ALTER TABLE "FinancePayrollEmployeeHours"
  ADD CONSTRAINT "FinancePayrollEmployeeHours_payrollWeekId_fkey"
  FOREIGN KEY ("payrollWeekId") REFERENCES "FinancePayrollWeek"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
