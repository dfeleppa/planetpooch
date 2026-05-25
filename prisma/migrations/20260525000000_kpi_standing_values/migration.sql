-- CreateEnum
CREATE TYPE "KpiStandingField" AS ENUM ('TARGET', 'AVERAGE');

-- AlterTable
ALTER TABLE "KpiWeeklyValue" DROP COLUMN "average",
DROP COLUMN "target";

-- CreateTable KpiStandingValue
CREATE TABLE "KpiStandingValue" (
    "id" TEXT NOT NULL,
    "segment" "KpiSegment" NOT NULL,
    "metricKey" TEXT NOT NULL,
    "field" "KpiStandingField" NOT NULL,
    "effectiveWeekStart" DATE NOT NULL,
    "amount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiStandingValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kpi_standing_unique" ON "KpiStandingValue"("segment", "metricKey", "field", "effectiveWeekStart");
