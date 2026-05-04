import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { syncRecentInsights } from "@/lib/meta/sync";
import { MetaApiError, MetaConfigError } from "@/lib/meta/client";

/**
 * Long-running: depending on ad volume, the trailing-7d insights pull can
 * take 10-30 seconds. Bump past Vercel's default function timeout.
 */
export const maxDuration = 120;

const SyncRequestSchema = z.object({
  days: z.number().int().min(1).max(30).default(7),
});

/**
 * Manual "Refresh now" button. The cron handler does the same thing on a
 * nightly schedule; this endpoint exists so a marketer can pull fresh
 * numbers immediately after an ad goes live.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { days?: number } = {};
  try {
    body = (await req.json()) as { days?: number };
  } catch {
    // empty body is fine — defaults apply
  }
  const parsed = SyncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid days value (1-30)." },
      { status: 400 }
    );
  }

  try {
    const result = await syncRecentInsights(parsed.data.days);
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
