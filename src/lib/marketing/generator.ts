import Anthropic from "@anthropic-ai/sdk";
import type { BrandVoiceProfile, ServiceLine, Platform } from "@prisma/client";
import { renderVoiceProfileForPrompt } from "./voice";
import { SERVICE_LINE_LABELS } from "./ideas";

/**
 * Static service-line context. Lives next to the voice profile inside the
 * cached portion of the system prompt — it doesn't change between calls and
 * is large enough to make a meaningful difference to caching cost.
 */
const SERVICE_LINE_BACKGROUND: Record<ServiceLine, string> = {
  GROOMING:
    "Mobile grooming. We come to the pet parent's driveway in a custom-fit van: hydraulic table, warm-water bath, hand-finishing. Pet never leaves the property. Differentiator: zero cage time, zero stress, one-on-one with the same groomer every visit.",
  DAYCARE:
    "Daycare. Open-concept play yards (indoor + outdoor), small temperament-matched groups, structured enrichment activities (puzzle feeders, scent work, sprinkler time in summer). Differentiator: not a 'daycare in a warehouse' — outdoor grass yards, real human-led enrichment, not just dogs sitting in a room.",
  BOARDING:
    "Overnight boarding. Glass-walled luxury suites with raised beds and TVs (calming dog content). Twice-daily 1:1 enrichment sessions, outdoor play yard time, glass-suite views of the lobby. Luxury add-ons: bedtime tuck-in, ice-cream cup, FaceTime with parents. Differentiator vs. boarding at the vet — vet boarding = ~3 walks/day + cage; ours = real bed, real time outside, real attention.",
  TRAINING:
    "Training. Both group classes (puppy socialization, basic manners, intermediate) and 1:1 private sessions for behavior issues. Force-free, reward-based. In-house trainers are CCPDT-certified.",
  MULTIPLE:
    "Multiple service lines may apply — feel free to weave them together if it strengthens the script.",
};

const SYSTEM_FRAME = `You are Planet Pooch's senior short-form video script writer. Your job is to turn a marketing insight into scripts and hook variants for organic + paid short-form video (Reels, TikTok, YT Shorts, Meta/FB feed).

# How to write a hook
The hook is the first 1-3 seconds — what stops the scroll. A great hook:
- Names a specific fear, frustration, or wish the pet parent already has
- Uses concrete, sensory detail (cage, glass, bed, vet smell, separation guilt)
- Avoids generic openers ("If you love your dog…", "Did you know…", "Three reasons…")
- Reads like one sentence a real person would say to a friend, not an ad
- Sounds different from the other hooks in the same set — vary the angle, not just the words

# How to write a script
The script is what comes after the hook. ~80–200 words. It should:
- Pay off the hook in the first 5 seconds (no setup, no preamble)
- Walk through 2-4 concrete differentiators with sensory specifics, not features lists
- End with a soft CTA ("DM us 'tour' for a same-week walkthrough", "Link in bio for our suite cam") — never "call now" or "limited time"

# Output format
Return STRICT JSON matching the requested schema. No markdown, no commentary outside the JSON.`;

/**
 * Build the system prompt blocks. The first block is the voice profile +
 * service-line context (cacheable). The second block is the static frame
 * (also cacheable). Caching kicks in once the prefix is at least 4096 tokens
 * on Opus 4.7 — for short voice profiles the first call may not cache, but
 * subsequent calls with the same voice version will hit consistently as the
 * exemplars grow.
 */
function buildSystemBlocks(
  voiceProfile: BrandVoiceProfile | null,
  serviceLine: ServiceLine
): Anthropic.TextBlockParam[] {
  const voiceText = renderVoiceProfileForPrompt(voiceProfile);
  const serviceLineText = SERVICE_LINE_BACKGROUND[serviceLine];

  const stableContext = [
    voiceText
      ? `# Brand voice (current version: v${voiceProfile?.version ?? "?"})\n${voiceText}`
      : "# Brand voice\n(No voice profile set — fall back to clear, warm, dog-obsessed copy.)",
    `# Service line context: ${SERVICE_LINE_LABELS[serviceLine]}\n${serviceLineText}`,
  ].join("\n\n");

  return [
    {
      type: "text",
      text: stableContext,
      cache_control: { type: "ephemeral" },
    },
    {
      type: "text",
      text: SYSTEM_FRAME,
    },
  ];
}

function buildUserMessage(input: {
  ideaTitle: string;
  insight: string;
  audience: string;
  tags: string[];
  notes: string;
  platform: Platform;
  scriptCount: number;
  hooksPerScript: number;
}): string {
  const platformGuidance =
    input.platform === "MULTI"
      ? "Format: short-form vertical video, suitable for Reels/TikTok/YT Shorts. Aim for ~30–45 second runtime."
      : `Format: ${input.platform}. Match the platform's pacing and length conventions.`;

  return [
    `# Idea\n${input.ideaTitle}`,
    `# Insight\n${input.insight || "(No insight provided — infer from the title and audience.)"}`,
    `# Audience\n${input.audience || "(General pet parents.)"}`,
    input.tags.length > 0 ? `# Tags\n${input.tags.join(", ")}` : null,
    input.notes ? `# Notes\n${input.notes}` : null,
    `# Constraints\n${platformGuidance}`,
    `# Task\nWrite ${input.scriptCount} distinct scripts. Each script must have ${input.hooksPerScript} different hook variants. Vary the hook angle (different pain point, different opener style, different framing) — not just word swaps.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const RESPONSE_SCHEMA = {
  type: "object" as const,
  properties: {
    scripts: {
      type: "array" as const,
      items: {
        type: "object" as const,
        properties: {
          body: {
            type: "string" as const,
            description: "The script body (~80-200 words). Excludes the hook.",
          },
          hooks: {
            type: "array" as const,
            items: {
              type: "object" as const,
              properties: {
                label: {
                  type: "string" as const,
                  description:
                    "A short internal label, 2-6 words, describing the angle (e.g., 'cage vs. suite', 'separation guilt').",
                },
                text: {
                  type: "string" as const,
                  description:
                    "The actual hook text, one sentence, 5-25 words.",
                },
              },
              required: ["label", "text"],
              additionalProperties: false,
            },
          },
        },
        required: ["body", "hooks"],
        additionalProperties: false,
      },
    },
  },
  required: ["scripts"],
  additionalProperties: false,
};

export type GeneratedScript = {
  body: string;
  hooks: { label: string; text: string }[];
};

export type GenerationResult = {
  scripts: GeneratedScript[];
  voiceProfileVersion: number | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

/**
 * Generate scripts + hooks for a marketing idea. Throws on API errors;
 * callers (route handlers) should catch and translate to a user-facing
 * message. ANTHROPIC_API_KEY must be set in the environment — the SDK reads
 * it automatically.
 */
export async function generateScriptsForIdea(input: {
  ideaTitle: string;
  insight: string;
  audience: string;
  serviceLine: ServiceLine;
  tags: string[];
  notes: string;
  platform: Platform;
  scriptCount: number;
  hooksPerScript: number;
  voiceProfile: BrandVoiceProfile | null;
}): Promise<GenerationResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to enable script generation."
    );
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 16000,
    system: buildSystemBlocks(input.voiceProfile, input.serviceLine),
    output_config: {
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: buildUserMessage(input),
      },
    ],
  });

  const textBlock = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  if (!textBlock) {
    throw new Error("Generator returned no text block.");
  }

  let parsed: { scripts: GeneratedScript[] };
  try {
    parsed = JSON.parse(textBlock.text) as { scripts: GeneratedScript[] };
  } catch {
    throw new Error(
      "Generator returned invalid JSON. Try again, or check the voice profile for unusual characters."
    );
  }

  if (!Array.isArray(parsed.scripts) || parsed.scripts.length === 0) {
    throw new Error("Generator returned no scripts.");
  }

  return {
    scripts: parsed.scripts,
    voiceProfileVersion: input.voiceProfile?.version ?? null,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}
