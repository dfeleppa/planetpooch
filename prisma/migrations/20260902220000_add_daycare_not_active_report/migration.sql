CREATE TABLE "MoegoDaycareNotActiveReport" (
    "id" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL,
    "cutoffDate" TIMESTAMP(3) NOT NULL,
    "inactivityDays" INTEGER NOT NULL DEFAULT 30,
    "customersScanned" INTEGER NOT NULL DEFAULT 0,
    "daycareCustomersScanned" INTEGER NOT NULL DEFAULT 0,
    "customerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoegoDaycareNotActiveReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MoegoDaycareNotActiveRow" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "lastAppointmentDate" TIMESTAMP(3) NOT NULL,
    "nextAppointmentDate" TIMESTAMP(3),
    "daysSinceLastAppointment" INTEGER NOT NULL,
    "preferredBusinessId" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoegoDaycareNotActiveRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoegoDaycareNotActiveRow_customerId_key"
ON "MoegoDaycareNotActiveRow"("customerId");

CREATE INDEX "MoegoDaycareNotActiveRow_reportId_lastAppointmentDate_idx"
ON "MoegoDaycareNotActiveRow"("reportId", "lastAppointmentDate");

CREATE INDEX "MoegoDaycareNotActiveRow_nextAppointmentDate_idx"
ON "MoegoDaycareNotActiveRow"("nextAppointmentDate");

ALTER TABLE "MoegoDaycareNotActiveRow"
ADD CONSTRAINT "MoegoDaycareNotActiveRow_reportId_fkey"
FOREIGN KEY ("reportId") REFERENCES "MoegoDaycareNotActiveReport"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
