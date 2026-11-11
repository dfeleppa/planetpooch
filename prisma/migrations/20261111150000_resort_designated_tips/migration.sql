CREATE TABLE "FinanceResortDesignatedTip" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employeeId" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "paidDate" DATE NOT NULL,
    "amountCents" INTEGER NOT NULL,
    CONSTRAINT "FinanceResortDesignatedTip_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "FinanceResortDesignatedTip_period_check" CHECK ("periodEnd" >= "periodStart"),
    CONSTRAINT "FinanceResortDesignatedTip_amount_check" CHECK ("amountCents" > 0)
);

ALTER TABLE "FinanceResortDesignatedTip" ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX "FinanceResortDesignatedTip_employeeId_periodStart_key"
    ON "FinanceResortDesignatedTip" ("employeeId", "periodStart");
CREATE INDEX "FinanceResortDesignatedTip_employeeId_periodEnd_idx"
    ON "FinanceResortDesignatedTip" ("employeeId", "periodEnd");
