import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getCampaignSegmentCatalog } from "@/lib/marketing/campaign-segment-catalog";
import { SEGMENTS } from "@/lib/marketing/campaign-segments";
import { z } from "zod";

const assignmentSchema = z.object({ source: z.enum(["meta", "google-ads", "google-lsa"]), campaignId: z.string().trim().min(1).max(500), segment: z.string().refine((value) => SEGMENTS.some((item) => item.value === value)) });
const schema = z.object({ assignments: z.array(assignmentSchema).min(1).max(1000) });
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const result = schema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Choose a valid campaign and segment." }, { status: 400 });
  const { assignments } = result.data;
  const catalog = await getCampaignSegmentCatalog();
  if (assignments.some((assignment) => !catalog.some((row) => row.source === assignment.source && row.id === assignment.campaignId))) return NextResponse.json({ error: "Campaign not found. Reload and try again." }, { status: 404 });
  const keys = assignments.map((row) => row.source + "|" + row.campaignId);
  if (new Set(keys).size !== keys.length) return NextResponse.json({ error: "Duplicate campaign assignments." }, { status: 400 });
  await prisma.$transaction(assignments.map(({ source, campaignId, segment }) => prisma.marketingCampaignSegment.upsert({ where: { source_campaignId: { source, campaignId } }, create: { source, campaignId, segment }, update: { segment } })));
  return NextResponse.json({ saved: assignments.length });
}
