-- AlterTable
ALTER TABLE "EsignRequest" ADD COLUMN "verifiedById" TEXT;

-- AddForeignKey
ALTER TABLE "EsignRequest" ADD CONSTRAINT "EsignRequest_verifiedById_fkey"
  FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
