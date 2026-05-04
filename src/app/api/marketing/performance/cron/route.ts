import { NextRequest, NextResponse } from "next/server";
import { syncRecentInsights } from "@/lib/meta/sync";
import { MetaApiError, MetaConfigError } from "@/lib/meta/client";

export const maxDuration = 120;

/**
 * Triggered by Vercel Cron (see vercel.json). Vercel signs cron requests
 * with `Authorization: Bearer ${CRON_SECRET}` if the env var is set —
 * required so a public GET can't kick off a sync.
 *
 * Re-syncs the trailing 7 days because Meta backfills attribution for ~3
 * days after the click. Idempotent: each (adId, date) is upserted, so
 * re-runs converge on Meta's latest numbers.
 */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncRecentInsights(7);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MetaConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof MetaApiError) {
      return NextResponse.json(
        { error: `Meta API: ${err.message}`, fbCode: err.fbCode },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
