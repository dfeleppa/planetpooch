import Anthropic from "@anthropic-ai/sdk";
import type { BrandVoiceProfile, ServiceLine, Script, Angle } from "@prisma/client";
import type { ScriptModel } from "@/lib/validators/marketing";
import {
  buildSharedSystemPrefix,
  extractJson,
  readUsage,
  requireApiKey,
  type Usage,
} from "./shared";

/**
 * Hook variants are the EXCEPTION to the no-near-duplicates rule. Only run
 * after a script has proven itself with ad spend (UI gates this on
 * status=WINNER or a manual unlock). The angle, body, CTA, and shot list
 * stay fixed — the variants explore different opening framings of the
 * same proven angle.
 */
const VARIANT_FRAME = `You are writing hook variants for a script that has already proven
itself with ad spend. The body, CTA, and shot list stay fixed.

Generate alternative hooks — same angle, same emotional register,
same audience pocket — but with different opening framings.

These variants are the EXCEPTION to the no-near-duplicates rule:
this angle has earned the right to be tested at the hook level.

Vary the entry point, not the angle:
- question vs. statement vs. observation vs. direct address
- past-tense story vs. present-tense scene vs. second-person address
- name the pain first vs. name the relief first

Same register, same pocket, same core message — different door in.
Each variant is one sentence, 5–25 words, no setup.

# Output format
Return STRICT JSON matching the requested schema. No markdown,
no commentary outside the JSON.`;

function buildSchema(count: number) {
  return {
    type: "object" as const,
    properties: {
      variants: {
        type: "array" as const,
        minItems: count,
        maxItems: count,
        items: {
          type: "object" as const,
          properties: {
            label: {
              type: "string" as const,
              description:
                "2-4 word internal label for the entry point (e.g., 'question', 'past-tense story').",
            },
            text: { type: "string" as const },
          },
          required: ["label", "text"],
          additionalProperties: false,
        },
      },
    },
    required: ["variants"],
    additionalProperties: false,
  };
}

export type GeneratedHookVariant = { label: string; text: string };
export type HookVariantResult = {
  variants: GeneratedHookVariant[];
  voiceProfileVersion: number | null;
} & Usage;

export async function generateHookVariantsForScript(input: {
  serviceLine: ServiceLine;
  script: Script;
  angle: Angle | null;
  voiceProfile: BrandVoiceProfile | null;
  model: ScriptModel;
  count: number;
}): Promise<HookVariantResult> {
  requireApiKey();
  const client = new Anthropic();

  const angleBlock = input.angle
    ? `# Angle (locked)\n` +
      `Name: ${input.angle.name}\n` +
      `Emotional register: ${input.angle.emotionalRegister}\n` +
      `Audience pocket: ${input.angle.audiencePocket}\n` +
      `Core message: ${input.angle.coreMessage}`
    : `# Angle\n(No angle linked — match the existing hook's register and audience.)`;

  const userContent = [
    angleBlock,
    `# Existing winning hook (the variants must stay in this lane)\n${input.script.hook || "(none)"}`,
    `# Body\n${input.script.body}`,
    `# CTA\n${input.script.cta}`,
    `# Task\nWrite ${input.count} hook variants. Same angle, same register, same pocket — different entry points.`,
  ].join("\n\n");

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 2000,
    system: [
      buildSharedSystemPrefix(input.voiceProfile, input.serviceLine),
      { type: "text", text: VARIANT_FRAME },
    ],
    output_config: {
      format: { type: "json_schema", schema: buildSchema(input.count) },
    },
    messages: [{ role: "user", content: userContent }],
  });

  const parsed = extractJson<{ variants: GeneratedHookVariant[] }>(response);
  if (!Array.isArray(parsed.variants) || parsed.variants.length === 0) {
    throw new Error("Generator returned no hook variants.");
  }

  return {
    variants: parsed.variants,
    voiceProfileVersion: input.voiceProfile?.version ?? null,
    ...readUsage(response),
  };
}
