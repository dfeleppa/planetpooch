import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

// Reuse the client across hot reloads in dev and across requests inside a
// single Vercel lambda in prod. Without this, each request can spin up a new
// PrismaClient and quickly exhaust the Supabase connection pool.
globalForPrisma.prisma = prisma;
