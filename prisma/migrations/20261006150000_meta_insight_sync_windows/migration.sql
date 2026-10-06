CREATE TABLE "MetaInsightSyncWindow" (
    "id" TEXT NOT NULL,
    "since" DATE NOT NULL,
    "until" DATE NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MetaInsightSyncWindow_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MetaInsightSyncWindow_since_until_idx" ON "MetaInsightSyncWindow"("since", "until");
