-- Add DOS role for top-tier corporate staff (Director of Operations).
-- Sits in the same permission tier as SUPER_ADMIN.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'DOS';
