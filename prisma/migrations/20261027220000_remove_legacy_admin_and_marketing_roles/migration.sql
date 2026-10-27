BEGIN;

-- Abort rather than silently changing access if a removed role was assigned.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "role"::text IN ('ADMIN', 'MARKETING')) THEN
    RAISE EXCEPTION 'Cannot remove roles while ADMIN or MARKETING accounts exist';
  END IF;
END $$;

-- Remove obsolete article audiences without broadening access.
UPDATE "KnowledgeArticle"
SET "allowedRoles" = array_remove(array_remove("allowedRoles", 'ADMIN'::"Role"), 'MARKETING'::"Role")
WHERE "allowedRoles" && ARRAY['ADMIN', 'MARKETING']::"Role"[];

ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "allowedRoles" DROP DEFAULT;
ALTER TYPE "Role" RENAME TO "Role_old";
CREATE TYPE "Role" AS ENUM ('FRONT_DESK', 'SUPER_ADMIN', 'MANAGER', 'EMPLOYEE');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "allowedRoles" TYPE "Role"[] USING ("allowedRoles"::text[]::"Role"[]);
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'EMPLOYEE'::"Role";
ALTER TABLE "KnowledgeArticle" ALTER COLUMN "allowedRoles" SET DEFAULT ARRAY['SUPER_ADMIN']::"Role"[];
DROP TYPE "Role_old";

COMMIT;
