import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { GenerateAdAssetSchema } from "@/lib/validators/marketing";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";
import { generateAdAsset } from "@/lib/marketing/generators/adAssets";

export const maxDuration = 120;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ideaId } = await params;
  const assets = await prisma.adAsset.findMany({
    where: { ideaId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ assets });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ideaId } = await params;
  const parsed = await validateBody(req, GenerateAdAssetSchema);
  if (!parsed.ok) return parsed.response;

  const idea = await prisma.marketingIdea.findUnique({ where: { id: ideaId } });
  if (!idea) {
    return NextResponse.json({ error: "Brief not found" }, { status: 404 });
  }

  try {
    const voiceProfile = await getLatestVoiceProfile();
    const generated = await generateAdAsset({
      idea,
      type: parsed.data.type,
      voiceProfile,
      model: parsed.data.model,
    });
    const asset = await prisma.adAsset.create({
      data: {
        ideaId,
        name: generated.content.name,
        type: generated.type,
        content: generated.content,
        model: parsed.data.model,
        voiceProfileVersion: generated.voiceProfileVersion,
        createdById: (session.user as { id: string }).id,
      },
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
