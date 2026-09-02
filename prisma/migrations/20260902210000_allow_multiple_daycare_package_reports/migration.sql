DROP INDEX "MoegoDaycarePackageCreditRow_packageId_key";

CREATE UNIQUE INDEX "MoegoDaycarePackageCreditRow_reportId_packageId_key"
ON "MoegoDaycarePackageCreditRow"("reportId", "packageId");
