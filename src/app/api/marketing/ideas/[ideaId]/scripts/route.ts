import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { GenerateScriptsFromAnglesSchema } from "@/lib/validators/marketing";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";
import { generateScriptForAngle } from "@/lib/marketing/generators/scripts";

/**
 * Fan-out script generation. Up to 6 parallel Anthropic calls; the shared
 * cacheable system prefix means everything after the first hits cache-read.
 * 120s ceiling covers the slowest-model worst case.
 */
export const maxDuration = 120;

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

  const parsed = await validateBody(req, GenerateScriptsFromAnglesSchema);
  if (!parsed.ok) return parsed.response;

  const angles = await prisma.angle.findMany({
    where: { id: { in: parsed.data.angleIds }, ideaId },
  });
  if (angles.length === 0) {
    return NextResponse.json(
      { error: "None of the requested angles belong to this idea." },
      { status: 400 }
    );
  }

  const voiceProfile = await getLatestVoiceProfile();
  const userId = (session.user as { id: string }).id;

  // Fan out. We use Promise.allSettled so a single bad angle doesn't blow
  // up the whole batch — partial success is more useful than all-or-nothing.
  const settled = await Promise.allSettled(
    angles.map((angle) =>
      generateScriptForAngle({
        ideaTitle: idea.title,
        insight: idea.insight,
        serviceLine: idea.serviceLine,
        angle,
        voiceProfile,
        model: parsed.data.model,
      }).then((result) => ({ angle, result }))
    )
  );

  const created: { id: string; angleId: string }[] = [];
  const failures: { angleId: string; error: string }[] = [];
  let totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  for (let i = 0; i < settled.length; i++) {
    const s = settled[i];
    const angle = angles[i];
    if (s.status === "rejected") {
      failures.push({
        angleId: angle.id,
        error: s.reason instanceof Error ? s.reason.message : String(s.reason),
      });
      continue;
    }
    const { result } = s.value;
    totalUsage = {
      inputTokens: totalUsage.inputTokens + result.inputTokens,
      outputTokens: totalUsage.outputTokens + result.outputTokens,
      cacheReadTokens: totalUsage.cacheReadTokens + result.cacheReadTokens,
      cacheWriteTokens: totalUsage.cacheWriteTokens + result.cacheWriteTokens,
    };
    const script = await prisma.script.create({
      data: {
        ideaId: idea.id,
        angleId: angle.id,
        body: result.script.body,
        hook: result.script.hook,
        cta: result.script.cta,
        shotList: result.script.shot_list,
        onScreenTextStyle: result.script.on_screen_text_style,
        musicTone: result.script.music_tone,
        lengthTarget: result.script.length_target,
        platform: parsed.data.platform,
        voiceProfileVersion: result.voiceProfileVersion,
        model: parsed.data.model,
        createdById: userId,
      },
      select: { id: true },
    });
    created.push({ id: script.id, angleId: angle.id });
    await prisma.angle.update({
      where: { id: angle.id },
      data: { status: "GENERATED" },
    });
  }

  if (created.length === 0) {
    return NextResponse.json(
      { error: "All script generations failed.", failures },
      { status: 502 }
    );
  }

  return NextResponse.json(
    { created, failures, usage: totalUsage },
    { status: 201 }
  );
}
