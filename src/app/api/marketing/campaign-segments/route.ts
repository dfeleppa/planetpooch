import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCampaignSegmentCatalog } from "@/lib/marketing/campaign-segment-catalog";
import { SEGMENTS } from "@/lib/marketing/campaign-segments";
import { z } from "zod";

const schema = z.object({ source: z.enum(["meta", "google-ads", "google-lsa"]), campaignId: z.string().trim().min(1).max(500), segment: z.string().refine((value) => SEGMENTS.some((item) => item.value === value)) });
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Choose a valid campaign and segment." }, { status: 400 });
  const { source, campaignId, segment } = result.data;
  const catalog = await getCampaignSegmentCatalog();
  if (!catalog.some((row) => row.source === source && row.id === campaignId)) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  await prisma.marketingCampaignSegment.upsert({ where: { source_campaignId: { source, campaignId } }, create: { source, campaignId, segment }, update: { segment } });
  return NextResponse.json({ source, campaignId, segment });
}
