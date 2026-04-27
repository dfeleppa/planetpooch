-- CreateEnum
CREATE TYPE "EmployeeDocumentCategory" AS ENUM ('I9', 'ID_CARD', 'SS_CARD', 'OTHER');

-- CreateTable EmployeeDocument
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "category" "EmployeeDocumentCategory" NOT NULL,
    "customName" TEXT,
    "fileName" TEXT NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedById" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmployeeDocument_userId_idx" ON "EmployeeDocument"("userId");
CREATE INDEX "EmployeeDocument_category_idx" ON "EmployeeDocument"("category");

ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
