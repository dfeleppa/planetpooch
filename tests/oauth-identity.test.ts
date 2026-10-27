import { test } from "node:test";
import assert from "node:assert/strict";
import type { PrismaClient } from "@prisma/client";
import { hashLink, resolveOAuthUser, verifiedOAuthEmail } from "../src/lib/oauth-identity";

function fixture() {
  const users = [{ id: "existing", email: "person@example.com", terminatedAt: null as Date | null,
    role: "SUPER_ADMIN", company: "RESORT", oauthInviteHash: null as string | null,
    oauthInviteExpiresAt: null as Date | null }];
  const identities: { provider: string; subject: string; userId: string }[] = [];
  const tx = {
    user: {
      findFirst: async ({ where }: { where: { oauthInviteHash: string } }) => users.find((u) =>
        u.oauthInviteHash === where.oauthInviteHash && u.oauthInviteExpiresAt! > new Date() && !u.terminatedAt) ?? null,
      findMany: async ({ where }: { where: { email: { equals: string } } }) => users.filter((u) => u.email.toLowerCase() === where.email.equals),
      updateMany: async ({ where }: { where: { id: string; oauthInviteHash: string } }) => {
        const u = users.find((u) => u.id === where.id && u.oauthInviteHash === where.oauthInviteHash);
        if (!u) return { count: 0 };
        u.oauthInviteHash = null; u.oauthInviteExpiresAt = null;
        return { count: 1 };
      },
      update: async ({ where }: { where: { id: string } }) => users.find((u) => u.id === where.id),
    },
    oAuthIdentity: {
      findUnique: async ({ where }: { where: { provider_subject: { provider: string; subject: string } } }) => {
        const i = identities.find((i) => i.provider === where.provider_subject.provider && i.subject === where.provider_subject.subject);
        return i ? { ...i, user: users.find((u) => u.id === i.userId) } : null;
      },
      count: async ({ where }: { where: { userId: string } }) => identities.filter((i) => i.userId === where.userId).length,
      create: async ({ data }: { data: typeof identities[number] }) => { identities.push(data); },
    },
  };
  const db = { $transaction: async (fn: (client: typeof tx) => unknown) => fn(tx) } as unknown as PrismaClient;
  return { users, identities, db };
}
const profile = { email: "Person@Example.com", email_verified: true };

test("requires an explicitly verified, real email for initial matching", () => {
  assert.equal(verifiedOAuthEmail(profile), "person@example.com");
  for (const email_verified of [false, "false", undefined, 1]) {
    assert.equal(verifiedOAuthEmail({ ...profile, email_verified }), null);
  }
  assert.equal(verifiedOAuthEmail({ email: "nobody@placeholder.local", email_verified: true }), null);
  assert.equal(verifiedOAuthEmail({ ...profile, email_verified: "true" }), "person@example.com");
});
test("initial sign-in preserves user ID, role, company, and user count", async () => {
  const f = fixture();
  const user = await resolveOAuthUser(f.db, "google", "google-subject", profile);
  assert.equal(user?.id, "existing"); assert.equal(user?.role, "SUPER_ADMIN");
  assert.equal(user?.company, "RESORT"); assert.equal(f.users.length, 1);
});
test("linked Apple subject survives absent or changed email", async () => {
  const f = fixture();
  f.identities.push({ provider: "apple", subject: "stable", userId: "existing" });
  assert.equal((await resolveOAuthUser(f.db, "apple", "stable", {}))?.id, "existing");
  assert.equal((await resolveOAuthUser(f.db, "apple", "stable", { ...profile, email: "other@example.com" }))?.id, "existing");
});
test("unknown, ambiguous, unverified, and terminated accounts are denied", async () => {
  const f = fixture();
  assert.equal(await resolveOAuthUser(f.db, "google", "s", { ...profile, email: "unknown@example.com" }), null);
  assert.equal(await resolveOAuthUser(f.db, "google", "s", { ...profile, email_verified: false }), null);
  f.users.push({ ...f.users[0], id: "duplicate", email: "PERSON@example.com" });
  assert.equal(await resolveOAuthUser(f.db, "google", "s", profile), null);
  f.users.pop(); f.users[0].terminatedAt = new Date();
  assert.equal(await resolveOAuthUser(f.db, "google", "s", profile), null);
  f.identities.push({ provider: "apple", subject: "linked", userId: "existing" });
  assert.equal(await resolveOAuthUser(f.db, "apple", "linked", {}), null);
  assert.equal(f.identities.length, 1);
});
test("single-use admin link connects a private relay to the original record", async () => {
  const f = fixture();
  f.users[0].oauthInviteHash = hashLink("secret");
  f.users[0].oauthInviteExpiresAt = new Date(Date.now() + 60_000);
  assert.equal((await resolveOAuthUser(f.db, "apple", "relay", {}, "secret"))?.id, "existing");
  assert.equal(await resolveOAuthUser(f.db, "apple", "another", {}, "secret"), null);
  assert.equal(f.users.length, 1); assert.equal(f.identities.length, 1);
});
test("expired links, unsupported providers, and extra identities without invites fail closed", async () => {
  const f = fixture();
  f.users[0].oauthInviteHash = hashLink("old"); f.users[0].oauthInviteExpiresAt = new Date(0);
  assert.equal(await resolveOAuthUser(f.db, "apple", "s", profile, "old"), null);
  assert.equal(await resolveOAuthUser(f.db, "credentials", "s", profile), null);
  await resolveOAuthUser(f.db, "google", "first", profile);
  assert.equal(await resolveOAuthUser(f.db, "google", "second", profile), null);
});
test("an invitation cannot move another person's existing OAuth identity", async () => {
  const f = fixture();
  f.users.push({ ...f.users[0], id: "other", email: "other@example.com" });
  f.identities.push({ provider: "google", subject: "bound", userId: "other" });
  f.users[0].oauthInviteHash = hashLink("secret");
  f.users[0].oauthInviteExpiresAt = new Date(Date.now() + 60_000);
  assert.equal(await resolveOAuthUser(f.db, "google", "bound", profile, "secret"), null);
  assert.equal(f.identities[0].userId, "other");
  assert.equal(f.users[0].oauthInviteHash, hashLink("secret"));
});
