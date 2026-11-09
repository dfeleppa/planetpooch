import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateGoogleAdsWindow } from "@/lib/marketing/google-ads-sync";
import { syncGoogleLsaWindow } from "@/lib/marketing/google-lsa-sync";

export const maxDuration = 120;
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null);
  if (typeof body?.from !== "string" || typeof body?.to !== "string" || !validateGoogleAdsWindow(body.from, body.to)) {
    return NextResponse.json({ error: "Choose a valid date range of at most 366 days." }, { status: 400 });
  }
  try {
    const result = await syncGoogleLsaWindow(body.from, body.to);
    return NextResponse.json(result, { status: result.synced ? 200 : 409 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Google LSA sync failed. Previous data has been preserved." }, { status: 502 });
  }
}
