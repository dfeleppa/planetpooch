import { NextRequest, NextResponse } from "next/server";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const assignmentSchema = z.object({
  campaignId: z.string().min(1),
  companies: z.array(z.enum(["RESORT", "GROOMING"])).min(1).max(2),
});

export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const result = assignmentSchema.safeParse(await request.json().catch(() => null));
  if (!result.success) return NextResponse.json({ error: "Choose a business for this campaign." }, { status: 400 });
  const { campaignId } = result.data;
  const companies = [...new Set(result.data.companies)];
  const campaign = await prisma.metaAdInsight.findFirst({ where: { campaignId }, select: { id: true } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const assignment = await prisma.metaCampaignBusiness.upsert({
    where: { campaignId }, create: { campaignId, companies }, update: { companies },
  });
  return NextResponse.json(assignment);
}
