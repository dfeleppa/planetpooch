-- Add new Role values
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';

-- Create Company enum
CREATE TYPE "Company" AS ENUM ('MOBILE', 'RESORT');

-- Add company column to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "company" "Company";

-- Data migration: convert ADMIN → SUPER_ADMIN
UPDATE "User" SET role = 'SUPER_ADMIN' WHERE role = 'ADMIN';
