import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { GoogleAdsApiError, GoogleAdsConfigError, syncGoogleAdsWindow, validateGoogleAdsWindow } from "@/lib/marketing/google-ads-sync";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { from?: unknown; to?: unknown } | null;
  const from = body?.from;
  const to = body?.to;
  if (typeof from !== "string" || typeof to !== "string" || !validateGoogleAdsWindow(from, to)) {
    return NextResponse.json({ error: "Choose a valid range of at most 366 days ending in or before the current month." }, { status: 400 });
  }
  try {
    const result = await syncGoogleAdsWindow(from, to);
    return NextResponse.json(result, { status: result.synced ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Ads sync failed.";
    return NextResponse.json({ error: message }, { status: error instanceof GoogleAdsConfigError ? 503 : error instanceof GoogleAdsApiError ? 502 : 500 });
  }
}
