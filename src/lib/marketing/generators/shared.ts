import Anthropic from "@anthropic-ai/sdk";
import type { BrandVoiceProfile, ServiceLine } from "@prisma/client";
import { renderVoiceProfileForPrompt } from "../voice";
import { SERVICE_LINE_LABELS } from "../ideas";

/**
 * Static service-line context. Lives next to the voice profile inside the
 * cached portion of the system prompt — it doesn't change between calls and
 * is large enough to make a meaningful difference to caching cost.
 *
 * Identical content was previously in the (now-deleted) generator.ts; moved
 * here so both the angle and script generators read from the same source.
 */
export const SERVICE_LINE_BACKGROUND: Record<ServiceLine, string> = {
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

/**
 * Build the cacheable system prefix shared across the angle generator and
 * the script generator. Same voice profile + same service-line context →
 * same cache prefix → all parallel script-generation calls hit cache-read
 * rates after the first.
 */
export function buildSharedSystemPrefix(
  voiceProfile: BrandVoiceProfile | null,
  serviceLine: ServiceLine
): Anthropic.TextBlockParam {
  const voiceText = renderVoiceProfileForPrompt(voiceProfile);
  const serviceLineText = SERVICE_LINE_BACKGROUND[serviceLine];

  const text = [
    voiceText
      ? `# Brand voice (current version: v${voiceProfile?.version ?? "?"})\n${voiceText}`
      : "# Brand voice\n(No voice profile set — fall back to clear, warm, dog-obsessed copy.)",
    `# Service line context: ${SERVICE_LINE_LABELS[serviceLine]}\n${serviceLineText}`,
  ].join("\n\n");

  return {
    type: "text",
    text,
    cache_control: { type: "ephemeral" },
  };
}

export function requireApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. Add it to your environment to enable generation."
    );
  }
}

export type Usage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
};

export function readUsage(response: Anthropic.Message): Usage {
  return {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
  };
}

/** Pull the single text block from a response or throw a clean error. */
export function extractJson<T>(response: Anthropic.Message): T {
  const block = response.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  if (!block) {
    throw new Error("Generator returned no text block.");
  }
  try {
    return JSON.parse(block.text) as T;
  } catch {
    throw new Error(
      "Generator returned invalid JSON. Try again, or check the voice profile for unusual characters."
    );
  }
}
