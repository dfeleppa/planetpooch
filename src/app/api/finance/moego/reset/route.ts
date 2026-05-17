import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

/**
 * Reset MoegoSyncState so the next sync re-pulls every resource from
 * the BACKFILL_DAYS-ago start. Useful when we change the parsing of a
 * field (e.g. fixed firstName+lastName or Money decoding) and want the
 * next sync to re-upsert existing rows with the corrected values.
 *
 * Idempotent and safe: existing rows stay put; `INSERT … ON CONFLICT
 * DO UPDATE` overwrites them in place as the backfill drains. Cost is
 * the API time to re-pull (slow for big histories).
 */
export async function POST() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const deleted = await prisma.moegoSyncState.deleteMany({});
  return NextResponse.json({ resetWatermarks: deleted.count });
}
