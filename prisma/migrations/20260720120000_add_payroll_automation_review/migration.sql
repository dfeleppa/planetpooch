ALTER TABLE "FinancePayrollWeek"
  ADD COLUMN "automationStatus" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "reviewReasons" JSONB,
  ADD COLUMN "sourceRowCount" INTEGER,
  ADD COLUMN "sourceGeneratedAt" TIMESTAMP(3);
