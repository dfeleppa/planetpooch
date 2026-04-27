-- CreateEnum
CREATE TYPE "EsignRequestStatus" AS ENUM ('SENT', 'SIGNED', 'CANCELLED');

-- CreateTable SignableDocument
CREATE TABLE "SignableDocument" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "driveFileId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SignableDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SignableDocument_isActive_idx" ON "SignableDocument"("isActive");

-- CreateTable EsignRequest
CREATE TABLE "EsignRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signableDocumentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "signedFileDriveId" TEXT,
    "status" "EsignRequestStatus" NOT NULL DEFAULT 'SENT',
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EsignRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EsignRequest_userId_idx" ON "EsignRequest"("userId");
CREATE INDEX "EsignRequest_signableDocumentId_idx" ON "EsignRequest"("signableDocumentId");
CREATE INDEX "EsignRequest_status_idx" ON "EsignRequest"("status");

ALTER TABLE "EsignRequest" ADD CONSTRAINT "EsignRequest_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EsignRequest" ADD CONSTRAINT "EsignRequest_signableDocumentId_fkey"
  FOREIGN KEY ("signableDocumentId") REFERENCES "SignableDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EsignRequest" ADD CONSTRAINT "EsignRequest_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
