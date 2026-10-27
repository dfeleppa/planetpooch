import { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { cookies } from "next/headers";
import { LINK_COOKIE, resolveOAuthUser } from "./oauth-identity";
import { prisma } from "./prisma";
import { Company, Role } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: { params: { prompt: "select_account" } },
    })] : []),
    ...(process.env.APPLE_ID && process.env.APPLE_SECRET ? [AppleProvider({
      clientId: process.env.APPLE_ID, clientSecret: process.env.APPLE_SECRET,
      checks: ["pkce", "state"],
    })] : []),
  ],
  // Apple's cross-site POST callback requires SameSite=None OAuth cookies.
  ...(process.env.NEXTAUTH_URL?.startsWith("https://") || process.env.VERCEL ? {
    cookies: Object.fromEntries(["state", "pkceCodeVerifier", "nonce"].map((key) => [key, {
      name: `__Secure-next-auth.${key === "pkceCodeVerifier" ? "pkce.code_verifier" : key}`,
      options: { httpOnly: true, sameSite: "none" as const, path: "/", secure: true, maxAge: 900 },
    }])),
  } : {}),
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ account }) {
      return !!account && ["google", "apple"].includes(account.provider);
    },
    async jwt({ token, user, account, profile, trigger }) {
      if (account) {
        const jar = await cookies();
        const invite = jar.get(LINK_COOKIE)?.value;
        jar.delete(LINK_COOKIE);
        const existing = await resolveOAuthUser(prisma, account.provider, account.providerAccountId,
          (profile ?? {}) as Record<string, unknown>, invite);
        if (!existing) throw new Error("OAuthAccountNotLinked");
        user = { ...existing, mustChangePassword: false };
        token.sub = existing.id;
        token.email = existing.email;
        token.name = existing.name;
      }
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.company = (user as { company?: Company | null }).company ?? null;
        token.jobTitle = (user as { jobTitle?: string | null }).jobTitle ?? null;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
        token.terminatedAt = null;
        token.lastChecked = Date.now();
      }

      // Refresh from DB when:
      //   1. The client called update(), OR
      //   2. The token hasn't been checked in 60s — needed because terminated
      //      users would otherwise keep an active session until JWT expiry.
      const STALENESS_MS = 60_000;
      const lastChecked = (token.lastChecked as number | undefined) ?? 0;
      const isStale = Date.now() - lastChecked > STALENESS_MS;
      const shouldRefresh = !!token.id && (trigger === "update" || isStale);

      if (shouldRefresh) {
        const fresh = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            mustChangePassword: true,
            role: true,
            company: true,
            jobTitle: true,
            terminatedAt: true,
            lastLoginAt: true,
          },
        });
        if (fresh) {
          if (!fresh.terminatedAt && !fresh.lastLoginAt) {
            try {
              await prisma.user.update({
                where: { id: token.id as string },
                data: { lastLoginAt: new Date() },
              });
            } catch (err) {
              console.error("[auth.jwt] lastLoginAt backfill failed:", err);
            }
          }
          token.mustChangePassword = false;
          token.role = fresh.role;
          token.company = fresh.company;
          token.jobTitle = fresh.jobTitle;
          token.terminatedAt = fresh.terminatedAt
            ? fresh.terminatedAt.toISOString()
            : null;
          token.lastChecked = Date.now();
        } else {
          // User row no longer exists — invalidate by removing identity. Cast
          // away the strict string type so we can drop the property; the
          // session callback returns an empty session when this is missing.
          delete (token as { id?: string }).id;
        }
      }

      return token;
    },
    async session({ session, token }) {
      // Terminated tokens produce an empty session — middleware / page guards
      // will redirect to /login. We don't throw here because NextAuth's session
      // contract expects a session object.
      if (token.terminatedAt || !token.id) {
        return { ...session, user: undefined as unknown as typeof session.user };
      }

      if (session.user) {
        const u = session.user as {
          id: string;
          role: Role;
          company: Company | null;
          jobTitle: string | null;
          mustChangePassword: boolean;
        };
        u.id = token.id as string;
        u.role = token.role as Role;
        u.company = (token.company as Company | null) ?? null;
        u.jobTitle = (token.jobTitle as string | null) ?? null;
        u.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
};
