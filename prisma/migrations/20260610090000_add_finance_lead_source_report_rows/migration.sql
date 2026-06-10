CREATE TABLE "FinanceLeadSourceReportRow" (
    "id" TEXT NOT NULL,
    "business" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "reportType" TEXT NOT NULL DEFAULT 'sales',
    "rowOrder" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL,
    "totalLeads" INTEGER,
    "totalValueCents" INTEGER,
    "open" INTEGER,
    "won" INTEGER,
    "lost" INTEGER,
    "abandoned" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceLeadSourceReportRow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceLeadSourceReportRow_business_periodStart_periodEnd_reportType_rowOrder_key" ON "FinanceLeadSourceReportRow"("business", "periodStart", "periodEnd", "reportType", "rowOrder");
CREATE INDEX "FinanceLeadSourceReportRow_business_periodStart_periodEnd_idx" ON "FinanceLeadSourceReportRow"("business", "periodStart", "periodEnd");
CREATE INDEX "FinanceLeadSourceReportRow_reportType_idx" ON "FinanceLeadSourceReportRow"("reportType");
