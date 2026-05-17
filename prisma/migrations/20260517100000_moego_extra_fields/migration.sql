-- Additional MoeGo fields surfaced from the upstream Customer / Order
-- schemas. All new columns are nullable / default 0 so existing rows
-- stay valid; values populate on the next resync.

ALTER TABLE "MoegoCustomer"
    ADD COLUMN "preferredBusinessId" TEXT,
    ADD COLUMN "lastAppointmentDate" TIMESTAMP(3),
    ADD COLUMN "nextAppointmentDate" TIMESTAMP(3),
    ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX "MoegoCustomer_preferredBusinessId_idx" ON "MoegoCustomer"("preferredBusinessId");
CREATE INDEX "MoegoCustomer_lastAppointmentDate_idx" ON "MoegoCustomer"("lastAppointmentDate");

ALTER TABLE "MoegoOrder"
    ADD COLUMN "businessId" TEXT,
    ADD COLUMN "taxCents" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "tipsCents" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "salesDatetime" TIMESTAMP(3),
    ADD COLUMN "completedTime" TIMESTAMP(3);

CREATE INDEX "MoegoOrder_businessId_idx" ON "MoegoOrder"("businessId");
