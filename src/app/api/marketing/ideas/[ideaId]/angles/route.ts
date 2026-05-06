import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { GenerateAnglesRequestSchema } from "@/lib/validators/marketing";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";
import { generateAnglesForIdea } from "@/lib/marketing/generators/angles";

/**
 * Long-running: Anthropic call + DB writes. The angle generator is a single
 * call but Sonnet/Opus on a long voice profile can run 20+ seconds.
 */
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
  const angles = await prisma.angle.findMany({
    where: { ideaId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ angles });
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
  const idea = await prisma.marketingIdea.findUnique({ where: { id: ideaId } });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const parsed = await validateBody(req, GenerateAnglesRequestSchema);
  if (!parsed.ok) return parsed.response;

  const voiceProfile = await getLatestVoiceProfile();

  let result;
  try {
    result = await generateAnglesForIdea({
      ideaTitle: idea.title,
      insight: idea.insight,
      audience: idea.audience,
      serviceLine: idea.serviceLine,
      tags: idea.tags,
      notes: idea.notes,
      voiceProfile,
      model: parsed.data.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const userId = (session.user as { id: string }).id;
  const created = await prisma.$transaction(
    result.angles.map((a) =>
      prisma.angle.create({
        data: {
          ideaId: idea.id,
          name: a.name,
          emotionalRegister: a.emotional_register,
          audiencePocket: a.audience_pocket,
          coreMessage: a.core_message,
          visualTreatment: a.visual_treatment,
          differentiator: a.differentiator,
          voiceProfileVersion: result.voiceProfileVersion,
          model: parsed.data.model,
          createdById: userId,
        },
      })
    )
  );

  return NextResponse.json(
    {
      angles: created,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        cacheReadTokens: result.cacheReadTokens,
        cacheWriteTokens: result.cacheWriteTokens,
      },
    },
    { status: 201 }
  );
}
