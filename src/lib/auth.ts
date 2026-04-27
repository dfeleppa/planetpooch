import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { Company, Role } from "@prisma/client";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user) return null;

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!isValid) return null;

        // Terminated employees cannot log in. We return the same null as a
        // wrong-password failure so we don't leak account state to attackers.
        if (user.terminatedAt) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          company: user.company,
          mustChangePassword: user.mustChangePassword,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
        token.company = (user as { company?: Company | null }).company ?? null;
        token.mustChangePassword = (user as { mustChangePassword?: boolean }).mustChangePassword ?? false;
        token.terminatedAt = null;
        token.lastChecked = Date.now();
      }

      // Refresh from DB when:
      //   1. The client called update() (e.g. after /change-password), OR
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
            terminatedAt: true,
          },
        });
        if (fresh) {
          token.mustChangePassword = fresh.mustChangePassword;
          token.role = fresh.role;
          token.company = fresh.company;
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
      if (token.terminatedAt) {
        return { ...session, user: undefined as unknown as typeof session.user };
      }

      if (session.user) {
        const u = session.user as {
          id: string;
          role: Role;
          company: Company | null;
          mustChangePassword: boolean;
        };
        u.id = token.id as string;
        u.role = token.role as Role;
        u.company = (token.company as Company | null) ?? null;
        u.mustChangePassword = Boolean(token.mustChangePassword);
      }
      return session;
    },
  },
};
