-- Rename Company enum value MOBILE -> GROOMING (preserves all existing data;
-- Postgres updates every column reference automatically).
ALTER TYPE "Company" RENAME VALUE 'MOBILE' TO 'GROOMING';

-- Add CORPORATE as a first-class company value. Cannot be referenced by data
-- updates in the same transaction — the next migration backfills with it.
ALTER TYPE "Company" ADD VALUE IF NOT EXISTS 'CORPORATE';
