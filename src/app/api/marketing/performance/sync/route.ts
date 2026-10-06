import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { syncInsightsWindow, syncRecentInsights } from "@/lib/meta/sync";
import { MetaApiError, MetaConfigError } from "@/lib/meta/client";

/**
 * Long-running: depending on ad volume, the trailing-7d insights pull can
 * take 10-30 seconds. Bump past Vercel's default function timeout.
 */
export const maxDuration = 120;

const SyncRequestSchema = z.object({
  days: z.number().int().min(1).max(30).optional(),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).refine((value) => {
  if (!value.since && !value.until) return true;
  if (!value.since || !value.until || value.days !== undefined) return false;
  const since = new Date(`${value.since}T00:00:00Z`);
  const until = new Date(`${value.until}T00:00:00Z`);
  return !Number.isNaN(since.getTime()) && !Number.isNaN(until.getTime()) &&
    since.toISOString().slice(0, 10) === value.since && until.toISOString().slice(0, 10) === value.until &&
    since <= until && until.getTime() - since.getTime() <= 29 * 86_400_000 &&
    until <= new Date();
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

  let body: { days?: number; since?: string; until?: string } = {};
  try {
    body = (await req.json()) as { days?: number; since?: string; until?: string };
  } catch {
    // empty body is fine — defaults apply
  }
  const parsed = SyncRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Use days 1-30, or a valid past since/until range of at most 30 days." },
      { status: 400 }
    );
  }

  try {
    const result = parsed.data.since && parsed.data.until
      ? await syncInsightsWindow(parsed.data.since, parsed.data.until)
      : await syncRecentInsights(parsed.data.days ?? 7);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof MetaConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof MetaApiError) {
      return NextResponse.json(
        {
          error: `Meta API: ${err.message}`,
          fbCode: err.fbCode,
          fbType: err.fbType,
          status: err.status,
        },
        { status: 502 }
      );
    }
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
