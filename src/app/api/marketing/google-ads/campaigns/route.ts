import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getGoogleAdsCampaignAssignments, GoogleAdsApiError, GoogleAdsConfigError, validateGoogleAdsWindow } from "@/lib/marketing/google-ads-sync";

async function authorized() {
  const session = await getSession();
  return Boolean(session?.user && hasMarketingAccess(session.user.role, session.user.jobTitle));
}

export async function GET(req: NextRequest) {
  if (!await authorized()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const from = req.nextUrl.searchParams.get("from") ?? "";
  const to = req.nextUrl.searchParams.get("to") ?? "";
  if (!validateGoogleAdsWindow(from, to)) return NextResponse.json({ error: "Choose a valid range of at most 366 days." }, { status: 400 });
  try {
    return NextResponse.json({ campaigns: await getGoogleAdsCampaignAssignments(from, to) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Ads campaign lookup failed.";
    return NextResponse.json({ error: message }, { status: error instanceof GoogleAdsConfigError ? 503 : error instanceof GoogleAdsApiError ? 502 : 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!await authorized()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await req.json().catch(() => null) as { campaignId?: unknown; campaign?: unknown; business?: unknown } | null;
  const campaignId = body?.campaignId;
  const campaign = body?.campaign;
  const business = body?.business;
  if (typeof campaignId !== "string" || !/^\d+$/.test(campaignId) || typeof campaign !== "string" || !campaign.trim() ||
    (business !== "pet-resort" && business !== "mobile-grooming" && business !== "excluded" && business !== null)) {
    return NextResponse.json({ error: "Choose Pet Resort, Mobile Grooming, or Exclude for this campaign." }, { status: 400 });
  }
  const saved = await prisma.googleAdsCampaignBusiness.upsert({
    where: { campaignId },
    create: { campaignId, campaign: campaign.trim(), business },
    update: { campaign: campaign.trim(), business },
  });
  return NextResponse.json({ campaign: saved });
}
