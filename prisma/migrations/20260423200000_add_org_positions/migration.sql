-- CreateTable
CREATE TABLE "OrgPosition" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" "Company",
    "parentPositionId" TEXT,
    "assignedUserId" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgPosition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgPosition_assignedUserId_key" ON "OrgPosition"("assignedUserId");

-- CreateIndex
CREATE INDEX "OrgPosition_parentPositionId_idx" ON "OrgPosition"("parentPositionId");

-- CreateIndex
CREATE INDEX "OrgPosition_company_idx" ON "OrgPosition"("company");

-- AddForeignKey
ALTER TABLE "OrgPosition" ADD CONSTRAINT "OrgPosition_parentPositionId_fkey" FOREIGN KEY ("parentPositionId") REFERENCES "OrgPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgPosition" ADD CONSTRAINT "OrgPosition_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
