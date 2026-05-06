import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { RegenerateAngleRequestSchema } from "@/lib/validators/marketing";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";
import { regenerateSingleAngle } from "@/lib/marketing/generators/angles";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ angleId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { angleId } = await params;
  const target = await prisma.angle.findUnique({
    where: { id: angleId },
    include: { idea: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Angle not found" }, { status: 404 });
  }

  const parsed = await validateBody(req, RegenerateAngleRequestSchema);
  if (!parsed.ok) return parsed.response;

  // Siblings = every other angle for this idea that hasn't been discarded.
  // We pass them to the generator so the replacement differs on register +
  // pocket from each survivor.
  const siblings = await prisma.angle.findMany({
    where: {
      ideaId: target.ideaId,
      id: { not: angleId },
      status: { not: "DISCARDED" },
    },
  });

  const voiceProfile = await getLatestVoiceProfile();

  let result;
  try {
    result = await regenerateSingleAngle({
      ideaTitle: target.idea.title,
      insight: target.idea.insight,
      audience: target.idea.audience,
      serviceLine: target.idea.serviceLine,
      tags: target.idea.tags,
      notes: target.idea.notes,
      siblings: siblings.map((s) => ({
        name: s.name,
        emotional_register: s.emotionalRegister,
        audience_pocket: s.audiencePocket,
        core_message: s.coreMessage,
        visual_treatment: s.visualTreatment,
        differentiator: s.differentiator,
      })),
      guidance: parsed.data.guidance,
      voiceProfile,
      model: parsed.data.model,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Regeneration failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Replace the existing angle in place — keeps the ID stable so any UI
  // selection state stays valid.
  const updated = await prisma.angle.update({
    where: { id: angleId },
    data: {
      name: result.angle.name,
      emotionalRegister: result.angle.emotional_register,
      audiencePocket: result.angle.audience_pocket,
      coreMessage: result.angle.core_message,
      visualTreatment: result.angle.visual_treatment,
      differentiator: result.angle.differentiator,
      voiceProfileVersion: result.voiceProfileVersion,
      model: parsed.data.model,
      wasEdited: false,
      status: "DRAFT",
    },
  });

  return NextResponse.json({
    angle: updated,
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cacheReadTokens: result.cacheReadTokens,
      cacheWriteTokens: result.cacheWriteTokens,
    },
  });
}
