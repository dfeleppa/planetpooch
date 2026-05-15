-- MoeGo CRM sync tables. We keep a slim projection of Customer/Order/Lead
-- so the finance dashboard can compute LTV, lead source breakdown, and
-- (with Meta spend) blended CAC without round-tripping the MoeGo API on
-- every page load.

CREATE TABLE "MoegoCustomer" (
    "id" TEXT NOT NULL,
    "moegoId" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "mainPhoneNumber" TEXT,
    "leadSource" TEXT,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "lastUpdatedTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoegoCustomer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoegoCustomer_moegoId_key" ON "MoegoCustomer"("moegoId");
CREATE INDEX "MoegoCustomer_createdTime_idx" ON "MoegoCustomer"("createdTime");
CREATE INDEX "MoegoCustomer_leadSource_idx" ON "MoegoCustomer"("leadSource");
CREATE INDEX "MoegoCustomer_mainPhoneNumber_idx" ON "MoegoCustomer"("mainPhoneNumber");

CREATE TABLE "MoegoOrder" (
    "id" TEXT NOT NULL,
    "moegoId" TEXT NOT NULL,
    "customerMoegoId" TEXT,
    "status" TEXT,
    "subTotalCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "lastUpdatedTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoegoOrder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoegoOrder_moegoId_key" ON "MoegoOrder"("moegoId");
CREATE INDEX "MoegoOrder_customerMoegoId_idx" ON "MoegoOrder"("customerMoegoId");
CREATE INDEX "MoegoOrder_createdTime_idx" ON "MoegoOrder"("createdTime");

ALTER TABLE "MoegoOrder"
    ADD CONSTRAINT "MoegoOrder_customerMoegoId_fkey"
    FOREIGN KEY ("customerMoegoId") REFERENCES "MoegoCustomer"("moegoId")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MoegoLead" (
    "id" TEXT NOT NULL,
    "moegoId" TEXT NOT NULL,
    "name" TEXT,
    "mainPhoneNumber" TEXT,
    "referralSource" TEXT,
    "lifeCycleId" TEXT,
    "actionStatusId" TEXT,
    "createdTime" TIMESTAMP(3) NOT NULL,
    "lastUpdatedTime" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MoegoLead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoegoLead_moegoId_key" ON "MoegoLead"("moegoId");
CREATE INDEX "MoegoLead_mainPhoneNumber_idx" ON "MoegoLead"("mainPhoneNumber");
CREATE INDEX "MoegoLead_referralSource_idx" ON "MoegoLead"("referralSource");

CREATE TABLE "MoegoSyncState" (
    "resource" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3) NOT NULL,
    "lastRowCount" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoegoSyncState_pkey" PRIMARY KEY ("resource")
);
