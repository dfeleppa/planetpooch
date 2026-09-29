ALTER TABLE "GroomingVanMaintenance"
  ADD COLUMN "invoiceNumber" TEXT,
  ADD COLUMN "workOrderNumber" TEXT,
  ADD COLUMN "subtotal" DECIMAL(10,2),
  ADD COLUMN "tax" DECIMAL(10,2),
  ADD COLUMN "amountPaid" DECIMAL(10,2),
  ADD COLUMN "balanceDue" DECIMAL(10,2),
  ADD COLUMN "sourceFileName" TEXT,
  ADD COLUMN "sourceMimeType" TEXT,
  ADD COLUMN "sourceFileSize" INTEGER,
  ADD COLUMN "sourceSha256" TEXT;

CREATE UNIQUE INDEX "GroomingVanMaintenance_vanId_sourceSha256_key"
  ON "GroomingVanMaintenance"("vanId", "sourceSha256");
CREATE INDEX "GroomingVanMaintenance_vanId_invoiceNumber_idx"
  ON "GroomingVanMaintenance"("vanId", "invoiceNumber");

CREATE TABLE "GroomingVanMaintenanceDocument" (
  "id" TEXT NOT NULL,
  "maintenanceId" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  CONSTRAINT "GroomingVanMaintenanceDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroomingVanMaintenanceDocument_maintenanceId_key"
  ON "GroomingVanMaintenanceDocument"("maintenanceId");
ALTER TABLE "GroomingVanMaintenanceDocument" ADD CONSTRAINT "GroomingVanMaintenanceDocument_maintenanceId_fkey"
  FOREIGN KEY ("maintenanceId") REFERENCES "GroomingVanMaintenance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
