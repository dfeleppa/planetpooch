import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export const LINK_COOKIE = "pp-oauth-link";
export const hashLink = (value: string) => createHash("sha256").update(value).digest("hex");

export function verifiedOAuthEmail(profile: Record<string, unknown>): string | null {
  if (profile.email_verified !== true && profile.email_verified !== "true") return null;
  if (typeof profile.email !== "string") return null;
  const email = profile.email.trim().toLowerCase();
  return email.includes("@") && !email.endsWith("@placeholder.local") ? email : null;
}

// No user creation or role changes. Provider subjects remain attached even if
// the provider later changes or stops returning the user's email address.
export async function resolveOAuthUser(
  db: PrismaClient,
  provider: string,
  subject: string,
  profile: Record<string, unknown>,
  invite?: string,
) {
  if (!["google", "apple"].includes(provider) || !subject) return null;
  return db.$transaction(async (tx) => {
    const identity = await tx.oAuthIdentity.findUnique({
      where: { provider_subject: { provider, subject } }, include: { user: true },
    });
    const invited = invite ? await tx.user.findFirst({
      where: { oauthInviteHash: hashLink(invite), oauthInviteExpiresAt: { gt: new Date() }, terminatedAt: null },
    }) : null;
    if (invite && !invited) return null;
    if (identity && invited && identity.userId !== invited.id) return null;

    let user = identity?.user ?? invited;
    if (!user) {
      const email = verifiedOAuthEmail(profile);
      if (!email) return null;
      const matches = await tx.user.findMany({ where: { email: { equals: email, mode: "insensitive" } }, take: 2 });
      if (matches.length !== 1) return null;
      user = matches[0];
      // After first connection, another identity requires an admin-issued link.
      if (await tx.oAuthIdentity.count({ where: { userId: user.id } })) return null;
    }
    if (user.terminatedAt) return null;
    if (invited) {
      const consumed = await tx.user.updateMany({
        where: { id: invited.id, oauthInviteHash: hashLink(invite!), oauthInviteExpiresAt: { gt: new Date() }, terminatedAt: null },
        data: { oauthInviteHash: null, oauthInviteExpiresAt: null },
      });
      if (consumed.count !== 1) return null;
    }
    if (!identity) await tx.oAuthIdentity.create({ data: { provider, subject, userId: user.id } });
    return tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  });
}
