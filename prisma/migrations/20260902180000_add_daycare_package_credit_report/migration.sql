CREATE TABLE "MoegoDaycarePackageCreditReport" (
    "id" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "customersScanned" INTEGER NOT NULL DEFAULT 0,
    "packagesScanned" INTEGER NOT NULL DEFAULT 0,
    "matchingPackagesScanned" INTEGER NOT NULL DEFAULT 0,
    "packageCount" INTEGER NOT NULL DEFAULT 0,
    "totalRemainingCredits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoegoDaycarePackageCreditReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoegoDaycarePackageCreditRow" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "packageName" TEXT NOT NULL,
    "remainingCredits" INTEGER NOT NULL,
    "expirationDate" DATE NOT NULL,
    "purchaseTime" TIMESTAMP(3),
    "expirationWindowDays" INTEGER NOT NULL,
    "daysUntilExpiration" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoegoDaycarePackageCreditRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoegoDaycarePackageCreditRow_packageId_key"
ON "MoegoDaycarePackageCreditRow"("packageId");

CREATE INDEX "MoegoDaycarePackageCreditRow_reportId_expirationDate_idx"
ON "MoegoDaycarePackageCreditRow"("reportId", "expirationDate");

CREATE INDEX "MoegoDaycarePackageCreditRow_packageName_expirationDate_idx"
ON "MoegoDaycarePackageCreditRow"("packageName", "expirationDate");

CREATE INDEX "MoegoDaycarePackageCreditRow_customerId_idx"
ON "MoegoDaycarePackageCreditRow"("customerId");

ALTER TABLE "MoegoDaycarePackageCreditRow"
ADD CONSTRAINT "MoegoDaycarePackageCreditRow_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "MoegoDaycarePackageCreditReport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
