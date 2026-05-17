import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { syncAll } from "@/lib/moego/sync";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 300;

const MIN_YEAR = 2020;
const MAX_YEAR = new Date().getUTCFullYear();

/**
 * One-year resync. Pulls every customer / order / lead with
 * lastUpdatedTime in [Jan 1, Dec 31] of the requested year. Uses
 * its own per-year MoegoSyncState cursors so it doesn't disturb the
 * regular incremental sync watermarks. Idempotent: ON CONFLICT DO
 * UPDATE overwrites rows in place.
 *
 * Same chunked/runtime-budget semantics as the regular sync — the
 * caller (dashboard) is expected to poll until caughtUp.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const yearRaw = req.nextUrl.searchParams.get("year");
  const year = Number(yearRaw);
  if (
    !yearRaw ||
    !Number.isInteger(year) ||
    year < MIN_YEAR ||
    year > MAX_YEAR
  ) {
    return NextResponse.json(
      {
        error: `year must be an integer between ${MIN_YEAR} and ${MAX_YEAR} (got "${yearRaw}").`,
      },
      { status: 400 }
    );
  }

  const start = new Date(Date.UTC(year, 0, 1));
  // Exclusive upper bound on lastUpdatedTime; never sync past "now".
  const yearEnd = new Date(Date.UTC(year + 1, 0, 1));
  const end = yearEnd > new Date() ? new Date() : yearEnd;

  try {
    const result = await syncAll({
      window: { start, end, tag: `y${year}` },
    });
    return NextResponse.json({ year, ...result });
  } catch (err) {
    if (err instanceof MoegoConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof MoegoApiError) {
      return NextResponse.json(
        { error: `MoeGo API: ${err.message}` },
        { status: err.status }
      );
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("MoeGo year sync failed:", err);
    return NextResponse.json(
      { error: `Sync failed: ${message}` },
      { status: 500 }
    );
  }
}
