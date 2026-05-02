-- Add MARKETING role for the marketing team. Has access to the new
-- /marketing section; no access to admin / maintenance / tasks unless
-- the user is also SUPER_ADMIN.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MARKETING';
