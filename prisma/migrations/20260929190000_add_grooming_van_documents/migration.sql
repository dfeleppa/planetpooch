CREATE TABLE "GroomingVanDocument" (
  "id" TEXT NOT NULL,
  "vanId" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "issueDate" DATE,
  "expiryDate" DATE,
  "notes" TEXT NOT NULL DEFAULT '',
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "bytes" BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GroomingVanDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GroomingVanDocument_vanId_sha256_key" ON "GroomingVanDocument"("vanId", "sha256");
CREATE INDEX "GroomingVanDocument_vanId_category_idx" ON "GroomingVanDocument"("vanId", "category");
CREATE INDEX "GroomingVanDocument_expiryDate_idx" ON "GroomingVanDocument"("expiryDate");
ALTER TABLE "GroomingVanDocument" ADD CONSTRAINT "GroomingVanDocument_vanId_fkey"
  FOREIGN KEY ("vanId") REFERENCES "GroomingVan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroomingVanDocument" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "GroomingVanDocument" FROM PUBLIC, anon, authenticated;
