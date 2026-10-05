CREATE TABLE "MoegoAppointment" (
  "id" TEXT NOT NULL,
  "moegoId" TEXT NOT NULL,
  "customerMoegoId" TEXT,
  "orderMoegoId" TEXT,
  "businessId" TEXT,
  "status" TEXT,
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "noShow" BOOLEAN NOT NULL DEFAULT false,
  "createdTime" TIMESTAMP(3),
  "startTime" TIMESTAMP(3),
  "lastUpdatedTime" TIMESTAMP(3),
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MoegoAppointment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoegoAppointment_moegoId_key" ON "MoegoAppointment"("moegoId");
CREATE INDEX "MoegoAppointment_customerMoegoId_createdTime_idx" ON "MoegoAppointment"("customerMoegoId", "createdTime");
CREATE INDEX "MoegoAppointment_orderMoegoId_idx" ON "MoegoAppointment"("orderMoegoId");

ALTER TABLE "MoegoAppointment" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "MoegoAppointment" FROM PUBLIC, anon, authenticated;
