-- CreateTable EmployeeDocumentIssue
CREATE TABLE "EmployeeDocumentIssue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "EmployeeDocumentCategory" NOT NULL,
    "note" TEXT NOT NULL,
    "flaggedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocumentIssue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeDocumentIssue_userId_category_key" ON "EmployeeDocumentIssue"("userId", "category");
CREATE INDEX "EmployeeDocumentIssue_userId_idx" ON "EmployeeDocumentIssue"("userId");

ALTER TABLE "EmployeeDocumentIssue" ADD CONSTRAINT "EmployeeDocumentIssue_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocumentIssue" ADD CONSTRAINT "EmployeeDocumentIssue_flaggedById_fkey"
  FOREIGN KEY ("flaggedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
