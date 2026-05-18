-- CreateTable
CREATE TABLE "GhlOpportunityService" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GhlOpportunityService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GhlOpportunityService_opportunityId_key" ON "GhlOpportunityService"("opportunityId");

-- CreateIndex
CREATE INDEX "GhlOpportunityService_service_idx" ON "GhlOpportunityService"("service");
