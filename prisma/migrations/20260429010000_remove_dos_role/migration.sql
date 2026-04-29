-- Remove DOS from Role enum. DOS becomes a job title only; existing DOS
-- users are migrated to SUPER_ADMIN to preserve their top-tier access.

UPDATE "User" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'DOS';

ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'MANAGER', 'EMPLOYEE', 'ADMIN');

ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role"),
  ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE';

DROP TYPE "Role_old";
