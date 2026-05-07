-- Track the last successful sign-in timestamp per user so admins can
-- see at a glance whether an employee has actually used their account.
-- Nullable: existing rows haven't logged in under this column yet.
ALTER TABLE "User" ADD COLUMN "lastLoginAt" TIMESTAMP(3);
