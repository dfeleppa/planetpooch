-- Additive migration: all existing users and history are preserved.
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET DEFAULT '';
ALTER TABLE "User" ADD COLUMN "oauthInviteHash" TEXT, ADD COLUMN "oauthInviteExpiresAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "User_oauthInviteHash_key" ON "User"("oauthInviteHash");
CREATE TABLE "OAuthIdentity" (
 "id" TEXT NOT NULL, "provider" TEXT NOT NULL, "subject" TEXT NOT NULL,
 "userId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CONSTRAINT "OAuthIdentity_pkey" PRIMARY KEY ("id"),
 CONSTRAINT "OAuthIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "OAuthIdentity_provider_subject_key" ON "OAuthIdentity"("provider", "subject");
CREATE INDEX "OAuthIdentity_userId_idx" ON "OAuthIdentity"("userId");
-- OAuth identities are server-only. Prisma connects using the database owner.
ALTER TABLE "OAuthIdentity" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON "OAuthIdentity" FROM anon, authenticated;
