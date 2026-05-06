import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { GenerateHookVariantsSchema } from "@/lib/validators/marketing";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";
import { generateHookVariantsForScript } from "@/lib/marketing/generators/hookVariants";

export const maxDuration = 120;

/**
 * Opt-in hook variants for a winning script. Intentionally NOT gated server-
 * side on `script.status === "WINNER"` — the strategist may want to test
 * variants on a not-yet-winner for an A/B sanity check. The UI button is
 * de-emphasized + warns the strategist; that's the cultural enforcement
 * point. The server just bills the call.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scriptId } = await params;
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: { idea: true, angle: true },
  });
  if (!script) {
    return NextResponse.json({ error: "Script not found" }, { status: 404 });
  }

  const parsed = await validateBody(req, GenerateHookVariantsSchema);
  if (!parsed.ok) return parsed.response;

  const voiceProfile = await getLatestVoiceProfile();

  let result;
  try {
    result = await generateHookVariantsForScript({
      serviceLine: script.idea.serviceLine,
      script,
      angle: script.angle,
      voiceProfile,
      model: parsed.data.model,
      count: parsed.data.count,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Append after any existing hook rows for stable ordering.
  const existing = await prisma.hook.count({ where: { scriptId } });
  const created = await prisma.$transaction(
    result.variants.map((v, i) =>
      prisma.hook.create({
        data: {
          scriptId,
          label: v.label,
          text: v.text,
          order: existing + i,
          isVariant: true,
          voiceProfileVersion: result.voiceProfileVersion,
          model: parsed.data.model,
        },
        select: { id: true },
      })
    )
  );

  return NextResponse.json(
    {
      hookIds: created.map((h) => h.id),
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
