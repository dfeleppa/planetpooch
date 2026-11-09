CREATE TABLE "GoogleLsaSyncWindow" (
  "id" TEXT NOT NULL,
  "business" TEXT NOT NULL,
  "from" DATE NOT NULL,
  "to" DATE NOT NULL,
  "customerId" TEXT NOT NULL,
  "spendCents" INTEGER NOT NULL,
  "calls" JSONB NOT NULL,
  "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GoogleLsaSyncWindow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoogleLsaSyncWindow_business_from_to_key" ON "GoogleLsaSyncWindow"("business", "from", "to");
ALTER TABLE "GoogleLsaSyncWindow" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "GoogleLsaSyncWindow" FROM anon, authenticated;
