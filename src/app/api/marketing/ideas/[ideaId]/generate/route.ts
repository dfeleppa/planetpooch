import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { GenerateScriptsRequestSchema } from "@/lib/validators/marketing";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";
import { generateScriptsForIdea } from "@/lib/marketing/generator";

/**
 * Long-running: Anthropic call + DB writes. Opus 4.7 with adaptive thinking
 * can take 30+ seconds for a 3 × 5 generation. Vercel's default function
 * timeout is too short — bump for this route specifically.
 */
export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ideaId } = await params;
  const idea = await prisma.marketingIdea.findUnique({
    where: { id: ideaId },
  });
  if (!idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const parsed = await validateBody(req, GenerateScriptsRequestSchema);
  if (!parsed.ok) return parsed.response;

  const voiceProfile = await getLatestVoiceProfile();

  let result;
  try {
    result = await generateScriptsForIdea({
      ideaTitle: idea.title,
      insight: idea.insight,
      audience: idea.audience,
      serviceLine: idea.serviceLine,
      tags: idea.tags,
      notes: idea.notes,
      platform: parsed.data.platform,
      scriptCount: parsed.data.scriptCount,
      hooksPerScript: parsed.data.hooksPerScript,
      voiceProfile,
      model: parsed.data.model,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  const userId = (session.user as { id: string }).id;
  const created = await prisma.$transaction(
    result.scripts.map((script) =>
      prisma.script.create({
        data: {
          ideaId: idea.id,
          body: script.body,
          platform: parsed.data.platform,
          voiceProfileVersion: result.voiceProfileVersion,
          createdById: userId,
          hooks: {
            create: script.hooks.map((hook, i) => ({
              label: hook.label,
              text: hook.text,
              order: i,
              voiceProfileVersion: result.voiceProfileVersion,
            })),
          },
        },
        select: { id: true },
      })
    )
  );

  return NextResponse.json(
    {
      scriptIds: created.map((s) => s.id),
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
