import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const ALLOWED_DAYS = new Set([30, 90, 180, 365, 730]);
const RESOURCES = ["customer", "order", "lead"] as const;

/**
 * Reset MoegoSyncState so the next sync re-pulls history. Use this to
 * roll forward existing rows after a parsing fix (e.g. firstName +
 * lastName, paidAmount Money decoding).
 *
 * - POST with no `days`: deletes every watermark — next sync starts from
 *   BACKFILL_DAYS-ago (full history). Slow for big accounts.
 * - POST with `?days=N`: sets every watermark to `now - N days` — next
 *   sync re-pulls just that window. Much faster.
 *
 * Idempotent: existing rows stay put; `INSERT … ON CONFLICT DO UPDATE`
 * overwrites in place as the backfill drains.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const daysRaw = req.nextUrl.searchParams.get("days");
  if (daysRaw == null || daysRaw === "") {
    const deleted = await prisma.moegoSyncState.deleteMany({});
    return NextResponse.json({ mode: "scratch", cleared: deleted.count });
  }

  const days = Number(daysRaw);
  if (!ALLOWED_DAYS.has(days)) {
    return NextResponse.json(
      {
        error: `days must be one of ${[...ALLOWED_DAYS].join(", ")} (got "${daysRaw}").`,
      },
      { status: 400 }
    );
  }

  const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  for (const resource of RESOURCES) {
    await prisma.moegoSyncState.upsert({
      where: { resource },
      create: { resource, lastSyncedAt: start, lastRowCount: 0 },
      update: { lastSyncedAt: start, lastRowCount: 0 },
    });
  }
  return NextResponse.json({ mode: "windowed", days, syncedFrom: start });
}
