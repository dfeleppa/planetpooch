CREATE TABLE "FinanceMobileGroomingPayRule" (
    "id" TEXT NOT NULL,
    "employeeName" TEXT NOT NULL,
    "effectiveWeekStart" DATE NOT NULL,
    "payKind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingPayRule_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceMobileGroomingPayRule_kind_check" CHECK ("payKind" IN ('fixed', 'additive')),
    CONSTRAINT "FinanceMobileGroomingPayRule_amount_check" CHECK ("amountCents" >= 0)
);

CREATE UNIQUE INDEX "FinanceMobileGroomingPayRule_employeeName_effectiveWeekStart_key"
    ON "FinanceMobileGroomingPayRule"("employeeName", "effectiveWeekStart");
CREATE INDEX "FinanceMobileGroomingPayRule_effectiveWeekStart_idx"
    ON "FinanceMobileGroomingPayRule"("effectiveWeekStart");
ALTER TABLE "FinanceMobileGroomingPayRule" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FinanceMobileGroomingPayRule" FROM anon, authenticated;

CREATE TABLE "FinanceMobileGroomingPayPreparation" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "employeeName" TEXT NOT NULL,
    "prepared" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceMobileGroomingPayPreparation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceMobileGroomingPayPreparation_weekStart_employeeName_key"
    ON "FinanceMobileGroomingPayPreparation"("weekStart", "employeeName");
CREATE INDEX "FinanceMobileGroomingPayPreparation_weekStart_idx"
    ON "FinanceMobileGroomingPayPreparation"("weekStart");
ALTER TABLE "FinanceMobileGroomingPayPreparation" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "FinanceMobileGroomingPayPreparation" FROM anon, authenticated;

INSERT INTO "FinanceMobileGroomingPayRule"
    ("id", "employeeName", "effectiveWeekStart", "payKind", "amountCents", "updatedAt")
VALUES
    ('mobile-pay-stacey-20261017', 'Stacey Conti', '2026-10-17', 'additive', 71700, CURRENT_TIMESTAMP),
    ('mobile-pay-jose-20261017', 'Jose', '2026-10-17', 'fixed', 60000, CURRENT_TIMESTAMP);
