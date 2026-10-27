// Read-only cutover audit. Run with the intended environment loaded:
// npx tsx scripts/check-oauth-readiness.ts
// Apply the additive OAuth migration first, then verify real Google and Apple
// callbacks in a protected staging environment before publishing OAuth-only auth.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
async function main() {
  const configured = {
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    apple: !!(process.env.APPLE_ID && process.env.APPLE_SECRET),
  };
  const users = await db.user.findMany({
    where: { terminatedAt: null },
    select: { id: true, email: true, role: true, oauthIdentities: { select: { provider: true } } },
  });
  const byEmail = new Map<string, string[]>();
  for (const user of users) {
    const email = user.email.trim().toLowerCase();
    byEmail.set(email, [...(byEmail.get(email) ?? []), user.id]);
  }
  const needsConnectionLink = users.filter((u) => !u.oauthIdentities.length &&
    (u.email.endsWith("@placeholder.local") || (byEmail.get(u.email.trim().toLowerCase())?.length ?? 0) !== 1));
  console.log(JSON.stringify({
    configured, activeAccounts: users.length,
    connectedAccounts: users.filter((u) => u.oauthIdentities.length).length,
    needsConnectionLink: needsConnectionLink.map((u) => ({ id: u.id, role: u.role })),
    unconnectedAdministrators: users.filter((u) => ["SUPER_ADMIN", "ADMIN"].includes(u.role) && !u.oauthIdentities.length).map((u) => u.id),
    note: "A unique real email is only a candidate match. Confirm the employee controls it through Google or Apple; otherwise issue a connection link. Test both callbacks before cutover.",
  }, null, 2));
}
main().catch(() => { console.error("OAuth readiness audit failed. Check database connectivity and that the OAuth migration is applied."); process.exitCode = 1; })
  .finally(() => db.$disconnect());
