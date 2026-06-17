-- Stored snapshot for upcoming Boarding KPI nights. Data is refreshed only
-- when an admin requests it from the KPI page.
CREATE TABLE "MoegoUpcomingBoardingNight" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "weekEnding" DATE NOT NULL,
    "nightCount" INTEGER NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoegoUpcomingBoardingNight_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoegoUpcomingBoardingNight_businessId_weekStart_key"
ON "MoegoUpcomingBoardingNight"("businessId", "weekStart");

CREATE INDEX "MoegoUpcomingBoardingNight_businessId_weekEnding_idx"
ON "MoegoUpcomingBoardingNight"("businessId", "weekEnding");
