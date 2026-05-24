-- CreateEnum
CREATE TYPE "KpiSegment" AS ENUM ('MOBILE_GROOMING', 'BOARDING', 'TRAINING', 'DAYCARE', 'IN_HOUSE_GROOMING');

-- CreateTable KpiWeeklyValue
CREATE TABLE "KpiWeeklyValue" (
    "id" TEXT NOT NULL,
    "segment" "KpiSegment" NOT NULL,
    "weekStart" DATE NOT NULL,
    "metricKey" TEXT NOT NULL,
    "value" INTEGER,
    "average" INTEGER,
    "target" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KpiWeeklyValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "KpiWeeklyValue_segment_weekStart_metricKey_key" ON "KpiWeeklyValue"("segment", "weekStart", "metricKey");
