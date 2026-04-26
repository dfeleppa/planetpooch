-- Add firstName/lastName as nullable so we can backfill from existing name.
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;

-- Backfill: split name on first space. Single-token names go entirely to
-- firstName, with lastName mirroring the value so the "Last, First" Drive
-- folder format degrades gracefully ("Smith, Smith" beats blowing up).
UPDATE "User"
SET
  "firstName" = COALESCE(NULLIF(SPLIT_PART(TRIM("name"), ' ', 1), ''), 'Unknown'),
  "lastName" = CASE
    WHEN POSITION(' ' IN TRIM("name")) > 0
      THEN TRIM(SUBSTRING(TRIM("name") FROM POSITION(' ' IN TRIM("name")) + 1))
    ELSE COALESCE(NULLIF(TRIM("name"), ''), 'Unknown')
  END;

-- Enforce NOT NULL now that backfill is complete.
ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "lastName" SET NOT NULL;

-- Migrate User.company NULLs to CORPORATE (previous semantic: NULL meant
-- "cross-company / super admin"; CORPORATE is now the first-class label).
UPDATE "User" SET "company" = 'CORPORATE' WHERE "company" IS NULL;

-- Make User.company NOT NULL with default CORPORATE for new rows.
ALTER TABLE "User" ALTER COLUMN "company" SET NOT NULL;
ALTER TABLE "User" ALTER COLUMN "company" SET DEFAULT 'CORPORATE';

-- OrgPosition.company stays nullable on purpose: NULL = "cross-company position"
-- (e.g. CEO, Director of Strategy) — semantically distinct from User.company.
