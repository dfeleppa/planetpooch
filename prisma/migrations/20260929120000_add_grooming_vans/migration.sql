CREATE TABLE "GroomingVan" (
  "id" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "year" INTEGER,
  "make" TEXT,
  "model" TEXT,
  "vin" TEXT,
  "licensePlate" TEXT,
  "mileage" INTEGER,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "registrationExpiry" DATE,
  "insuranceExpiry" DATE,
  "inspectionExpiry" DATE,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GroomingVan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroomingVanMaintenance" (
  "id" TEXT NOT NULL,
  "vanId" TEXT NOT NULL,
  "serviceDate" DATE NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "mileage" INTEGER,
  "vendor" TEXT,
  "cost" DECIMAL(10,2),
  "nextDueDate" DATE,
  "nextDueMileage" INTEGER,
  "notes" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroomingVanMaintenance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroomingVan_number_key" ON "GroomingVan"("number");
CREATE INDEX "GroomingVanMaintenance_vanId_serviceDate_idx" ON "GroomingVanMaintenance"("vanId", "serviceDate" DESC);
CREATE INDEX "GroomingVanMaintenance_nextDueDate_idx" ON "GroomingVanMaintenance"("nextDueDate");
ALTER TABLE "GroomingVanMaintenance" ADD CONSTRAINT "GroomingVanMaintenance_vanId_fkey"
  FOREIGN KEY ("vanId") REFERENCES "GroomingVan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- The portal uses NextAuth and server-side Prisma access, not Supabase Auth.
ALTER TABLE "GroomingVan" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GroomingVanMaintenance" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "GroomingVan", "GroomingVanMaintenance" FROM PUBLIC, anon, authenticated;

-- Fixed fleet slots; actual vehicle details are entered on each van page.
INSERT INTO "GroomingVan" ("id", "number", "updatedAt")
SELECT 'grooming-van-' || LPAD(number::text, 2, '0'), number, CURRENT_TIMESTAMP
FROM generate_series(1, 10) AS fleet(number);
