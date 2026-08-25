CREATE TABLE "FinanceEmployeeCommission" (
  "id" TEXT NOT NULL,
  "employeeName" TEXT NOT NULL,
  "businessSegment" "KpiSegment" NOT NULL DEFAULT 'TRAINING',
  "weekStart" DATE NOT NULL,
  "paidDate" DATE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceEmployeeCommission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceEmployeeCommission_employee_segment_week_key"
  ON "FinanceEmployeeCommission"("employeeName", "businessSegment", "weekStart");

CREATE INDEX "FinanceEmployeeCommission_segment_employee_week_idx"
  ON "FinanceEmployeeCommission"("businessSegment", "employeeName", "weekStart");
