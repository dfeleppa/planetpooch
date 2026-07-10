import Anthropic from "@anthropic-ai/sdk";
import type { BrandVoiceProfile, MarketingIdea } from "@prisma/client";
import type { ScriptModel } from "@/lib/validators/marketing";
import {
  buildSharedSystemPrefix,
  extractJson,
  readUsage,
  requireApiKey,
  type Usage,
} from "./shared";

export type MetaAdPack = {
  name: string;
  concept: string;
  hook: string;
  primaryText: string;
  headline: string;
  description: string;
  cta: string;
  script: string;
  shotList: string[];
};

export type GoogleSearchAdPack = {
  name: string;
  campaignTheme: string;
  keywordThemes: string[];
  headlines: string[];
  descriptions: string[];
  callouts: string[];
  sitelinks: Array<{
    text: string;
    description1: string;
    description2: string;
  }>;
};

export type GeneratedAdAsset =
  | { type: "META_AD"; content: MetaAdPack }
  | { type: "GOOGLE_SEARCH_AD"; content: GoogleSearchAdPack };

const META_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const },
    concept: { type: "string" as const },
    hook: { type: "string" as const },
    primaryText: { type: "string" as const },
    headline: { type: "string" as const },
    description: { type: "string" as const },
    cta: { type: "string" as const },
    script: { type: "string" as const },
    shotList: {
      type: "array" as const,
      minItems: 4,
      maxItems: 8,
      items: { type: "string" as const },
    },
  },
  required: [
    "name",
    "concept",
    "hook",
    "primaryText",
    "headline",
    "description",
    "cta",
    "script",
    "shotList",
  ],
  additionalProperties: false,
};

const GOOGLE_SCHEMA = {
  type: "object" as const,
  properties: {
    name: { type: "string" as const },
    campaignTheme: { type: "string" as const },
    keywordThemes: {
      type: "array" as const,
      minItems: 6,
      maxItems: 12,
      items: { type: "string" as const },
    },
    headlines: {
      type: "array" as const,
      minItems: 12,
      maxItems: 15,
      items: { type: "string" as const, maxLength: 30 },
    },
    descriptions: {
      type: "array" as const,
      minItems: 4,
      maxItems: 4,
      items: { type: "string" as const, maxLength: 90 },
    },
    callouts: {
      type: "array" as const,
      minItems: 4,
      maxItems: 8,
      items: { type: "string" as const, maxLength: 25 },
    },
    sitelinks: {
      type: "array" as const,
      minItems: 4,
      maxItems: 4,
      items: {
        type: "object" as const,
        properties: {
          text: { type: "string" as const, maxLength: 25 },
          description1: { type: "string" as const, maxLength: 35 },
          description2: { type: "string" as const, maxLength: 35 },
        },
        required: ["text", "description1", "description2"],
        additionalProperties: false,
      },
    },
  },
  required: [
    "name",
    "campaignTheme",
    "keywordThemes",
    "headlines",
    "descriptions",
    "callouts",
    "sitelinks",
  ],
  additionalProperties: false,
};

const META_INSTRUCTIONS = `Create one copy-ready Meta ad package from the brief.
Use a specific customer truth, not generic pet-care language. The hook must work
in the first 2-3 seconds. Primary text should be 80-160 words. The headline
must be concise and the CTA low-friction. The script and shot list must be
filmable by the Planet Pooch team. Return strict JSON only.`;

const GOOGLE_INSTRUCTIONS = `Create one copy-ready Google Responsive Search Ad
package from the brief. Produce 12-15 genuinely distinct headlines (30
characters maximum), exactly 4 descriptions (90 characters maximum), keyword
themes, callouts, and 4 sitelinks. Mix service, differentiator, location-intent,
trust, and action language. Do not repeat the same phrase across most assets.
Never invent prices, ratings, guarantees, certifications, or claims not present
in the brief or proof bank. Return strict JSON only.`;

function briefText(idea: MarketingIdea): string {
  return [
    `Brief: ${idea.title}`,
    `Service: ${idea.serviceLine}`,
    `Objective: ${idea.objective}`,
    `Audience: ${idea.audience || "Use the brand profile"}`,
    `Customer insight: ${idea.insight || "Not supplied"}`,
    `Offer: ${idea.offer || "Use the brand profile"}`,
    `Proof and differentiators: ${idea.proof || "Use verified brand proof only"}`,
    `Internal notes: ${idea.notes || "None"}`,
  ].join("\n");
}

export async function generateAdAsset(input: {
  idea: MarketingIdea;
  type: "META_AD" | "GOOGLE_SEARCH_AD";
  voiceProfile: BrandVoiceProfile | null;
  model: ScriptModel;
}): Promise<GeneratedAdAsset & Usage & { voiceProfileVersion: number | null }> {
  requireApiKey();
  const client = new Anthropic();
  const isMeta = input.type === "META_AD";

  const response = await client.messages.create({
    model: input.model,
    max_tokens: isMeta ? 3500 : 3000,
    system: [
      buildSharedSystemPrefix(input.voiceProfile, input.idea.serviceLine),
      {
        type: "text",
        text: isMeta ? META_INSTRUCTIONS : GOOGLE_INSTRUCTIONS,
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: isMeta ? META_SCHEMA : GOOGLE_SCHEMA,
      },
    },
    messages: [
      {
        role: "user",
        content: briefText(input.idea),
      },
    ],
  });

  const content = isMeta
    ? extractJson<MetaAdPack>(response)
    : extractJson<GoogleSearchAdPack>(response);

  return {
    type: input.type,
    content,
    voiceProfileVersion: input.voiceProfile?.version ?? null,
    ...readUsage(response),
  } as GeneratedAdAsset & Usage & { voiceProfileVersion: number | null };
}
