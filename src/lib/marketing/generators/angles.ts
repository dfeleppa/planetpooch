import Anthropic from "@anthropic-ai/sdk";
import type { BrandVoiceProfile, ServiceLine } from "@prisma/client";
import {
  EmotionalRegisterSchema,
  type EmotionalRegister,
  type ScriptModel,
} from "@/lib/validators/marketing";
import {
  buildSharedSystemPrefix,
  extractJson,
  readUsage,
  requireApiKey,
  type Usage,
} from "./shared";

/**
 * The angle generator is the highest-leverage piece of the Andromeda-era
 * refactor. Its job: take ONE idea + voice profile and emit 6–10 genuinely
 * distinct creative angles. Diversity is enforced in the system prompt and
 * spot-checked in code afterwards (register + pocket uniqueness).
 *
 * The model is told that minor reframings of the same concept are failures,
 * not features — Andromeda collapses near-duplicate creatives into a single
 * signal, so "5 hooks on 1 video" hurts performance.
 */
const ANGLE_FRAME = `You are a senior creative strategist. Your job is to take a marketing
insight and fan it out into 6–10 genuinely distinct ad angles for
short-form video.

# Why this matters
Meta's Andromeda retrieval system reads the actual content of every
creative — visuals, audio, text — and collapses near-duplicate ads into
a single signal. The old playbook (one video, five hook variants) now
underperforms because Andromeda treats them as one ad. Distinct concepts
win. Minor reframings of the same concept are failures, not features.

# What "distinct" means here
Two angles are NOT distinct if they only differ in:
- word choice or sentence structure
- which feature gets named first
- the tone of the opening line
- the same emotional pull dressed in different vocabulary

Two angles ARE distinct when they differ in BOTH:
- the emotional register (fear vs. pride vs. humor — pick from the
  brand's allowed tonal_range when one is set; never use a register
  outside it)
- the audience pocket — who, specifically, this lands for, in their
  own life context (new puppy parent at 11pm vs. owner of a senior dog
  vs. someone who just had a bad vet-boarding experience)

# Hard constraints
1. Generate 6–10 angles. Stop at the highest count where every angle
   is still genuinely distinct. Do not pad.
2. NO two angles may share the same emotional_register.
3. NO two angles may target the same audience_pocket. If two pockets
   are similar, drop one.
4. If the brand has a tonal_range set, NEVER use an emotional_register
   outside it.
5. NEVER write an angle whose framing falls inside forbidden_territory.
6. Ground "real results" claims in the proof_bank. If the proof bank
   doesn't support a claim, frame the angle around the proof you DO
   have, or pick a different angle. Never invent stats, names, or
   transformations.
7. Audience pockets are loose signals ("late-night new puppy parents",
   "owners burned by cage boarding"), not demographic personas.
   Andromeda handles targeting; the angle just has to land emotionally
   for that pocket.

# Self-check before you return
Before returning, scan your own output:
- Are all emotional_registers different? If two match, replace one.
- Could you describe each angle in one sentence and a stranger would
  recognize it as a different ad than the others? If not, it's a
  near-duplicate — replace it.
- Does each angle's differentiator field actually argue why it's
  distinct from the others, by name? ("Different from 'pain — vet
  smell' because this one leads with pride, not fear.") If the
  differentiator is generic, rewrite it.

# Output format
Return STRICT JSON matching the requested schema. No markdown,
no commentary outside the JSON.`;

const ANGLE_SCHEMA = {
  type: "object" as const,
  properties: {
    angles: {
      type: "array" as const,
      minItems: 6,
      maxItems: 10,
      items: {
        type: "object" as const,
        properties: {
          name: {
            type: "string" as const,
            description:
              "Short label, 3-8 words (e.g., 'Pain point — embarrassment').",
          },
          emotional_register: {
            type: "string" as const,
            enum: [
              "FEAR",
              "ASPIRATION",
              "HUMOR",
              "LOGIC",
              "PRIDE",
              "CURIOSITY",
              "NOSTALGIA",
              "COMMUNITY",
            ],
          },
          audience_pocket: {
            type: "string" as const,
            description:
              "Loose signal of who this lands for in their life context.",
          },
          core_message: {
            type: "string" as const,
            description: "One sentence the viewer would repeat back.",
          },
          visual_treatment: {
            type: "string" as const,
            description:
              "UGC talking head | cinematic | split-screen | static | demo | b-roll montage | etc.",
          },
          differentiator: {
            type: "string" as const,
            description:
              "Why this angle is meaningfully distinct — name another angle by name and contrast.",
          },
        },
        required: [
          "name",
          "emotional_register",
          "audience_pocket",
          "core_message",
          "visual_treatment",
          "differentiator",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["angles"],
  additionalProperties: false,
};

export type GeneratedAngle = {
  name: string;
  emotional_register: EmotionalRegister;
  audience_pocket: string;
  core_message: string;
  visual_treatment: string;
  differentiator: string;
};

export type AngleGenerationResult = {
  angles: GeneratedAngle[];
  voiceProfileVersion: number | null;
} & Usage;

function buildUserMessage(input: {
  ideaTitle: string;
  insight: string;
  audience: string;
  tags: string[];
  notes: string;
  guidance?: string;
  siblings?: GeneratedAngle[];
}): string {
  const blocks = [
    `# Idea\n${input.ideaTitle}`,
    `# Insight (the underlying truth — treat this as the core)\n${
      input.insight || "(No insight provided — infer from the title and audience.)"
    }`,
    `# Audience signal (loose — Andromeda handles pocketing)\n${
      input.audience || "(General pet parents.)"
    }`,
    input.tags.length > 0 ? `# Tags\n${input.tags.join(", ")}` : null,
    input.notes ? `# Notes\n${input.notes}` : null,
  ];

  if (input.siblings && input.siblings.length > 0) {
    blocks.push(
      `# Existing angles (the strategist already kept these — your new angle MUST differ from each on register AND audience pocket)\n` +
        input.siblings
          .map(
            (s, i) =>
              `${i + 1}. ${s.name} — register=${s.emotional_register}, pocket="${s.audience_pocket}"`
          )
          .join("\n")
    );
  }

  if (input.guidance) {
    blocks.push(`# Strategist guidance for this regeneration\n${input.guidance}`);
  }

  blocks.push(
    input.siblings && input.siblings.length > 0
      ? `# Task\nGenerate ONE replacement angle that differs from every existing angle on BOTH emotional_register and audience_pocket. Same diversity rules apply.`
      : `# Task\nGenerate 6–10 distinct angles. Enforce the diversity rules above. Pull "real results" claims from the proof bank only.`
  );

  return blocks.filter(Boolean).join("\n\n");
}

/** Validate diversity rules in code as a backstop to the prompt. */
function enforceDiversity(angles: GeneratedAngle[]): GeneratedAngle[] {
  const seenRegisters = new Set<EmotionalRegister>();
  const seenPockets = new Set<string>();
  const kept: GeneratedAngle[] = [];
  for (const a of angles) {
    const pocketKey = a.audience_pocket.trim().toLowerCase();
    if (seenRegisters.has(a.emotional_register) || seenPockets.has(pocketKey)) {
      continue; // drop the duplicate; we'd rather return 7 than 8 with a dupe
    }
    seenRegisters.add(a.emotional_register);
    seenPockets.add(pocketKey);
    kept.push(a);
  }
  return kept;
}

/**
 * Step 1: idea → 6–10 distinct angles. Single LLM call. The strategist
 * reviews, edits, and selects in the UI before the script generator runs.
 */
export async function generateAnglesForIdea(input: {
  ideaTitle: string;
  insight: string;
  audience: string;
  serviceLine: ServiceLine;
  tags: string[];
  notes: string;
  voiceProfile: BrandVoiceProfile | null;
  model: ScriptModel;
}): Promise<AngleGenerationResult> {
  requireApiKey();
  const client = new Anthropic();

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 8000,
    system: [
      buildSharedSystemPrefix(input.voiceProfile, input.serviceLine),
      { type: "text", text: ANGLE_FRAME },
    ],
    output_config: {
      format: { type: "json_schema", schema: ANGLE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: buildUserMessage({
          ideaTitle: input.ideaTitle,
          insight: input.insight,
          audience: input.audience,
          tags: input.tags,
          notes: input.notes,
        }),
      },
    ],
  });

  const parsed = extractJson<{ angles: unknown[] }>(response);
  const validated = (parsed.angles ?? []).flatMap((raw): GeneratedAngle[] => {
    const a = raw as Partial<GeneratedAngle>;
    const reg = EmotionalRegisterSchema.safeParse(a.emotional_register);
    if (!reg.success || !a.name || !a.audience_pocket || !a.core_message) {
      return [];
    }
    return [
      {
        name: a.name,
        emotional_register: reg.data,
        audience_pocket: a.audience_pocket,
        core_message: a.core_message,
        visual_treatment: a.visual_treatment ?? "",
        differentiator: a.differentiator ?? "",
      },
    ];
  });

  const diverse = enforceDiversity(validated);
  if (diverse.length === 0) {
    throw new Error(
      "Generator returned no usable angles after diversity filtering."
    );
  }

  return {
    angles: diverse,
    voiceProfileVersion: input.voiceProfile?.version ?? null,
    ...readUsage(response),
  };
}

/**
 * Step 1b: re-roll a single angle. The strategist saw an angle they didn't
 * like and wants ONE replacement that still differs from the surviving
 * siblings on both register and pocket. Optional `guidance` lets them nudge
 * ("punchier", "less fear, more pride") without rewriting the prompt.
 */
export async function regenerateSingleAngle(input: {
  ideaTitle: string;
  insight: string;
  audience: string;
  serviceLine: ServiceLine;
  tags: string[];
  notes: string;
  siblings: GeneratedAngle[];
  guidance?: string;
  voiceProfile: BrandVoiceProfile | null;
  model: ScriptModel;
}): Promise<{ angle: GeneratedAngle; voiceProfileVersion: number | null } & Usage> {
  requireApiKey();
  const client = new Anthropic();

  const SINGLE_SCHEMA = {
    type: "object" as const,
    properties: { angle: ANGLE_SCHEMA.properties.angles.items },
    required: ["angle"],
    additionalProperties: false,
  };

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 2000,
    system: [
      buildSharedSystemPrefix(input.voiceProfile, input.serviceLine),
      { type: "text", text: ANGLE_FRAME },
    ],
    output_config: {
      format: { type: "json_schema", schema: SINGLE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: buildUserMessage({
          ideaTitle: input.ideaTitle,
          insight: input.insight,
          audience: input.audience,
          tags: input.tags,
          notes: input.notes,
          siblings: input.siblings,
          guidance: input.guidance,
        }),
      },
    ],
  });

  const parsed = extractJson<{ angle: Partial<GeneratedAngle> }>(response);
  const reg = EmotionalRegisterSchema.safeParse(parsed.angle?.emotional_register);
  if (
    !reg.success ||
    !parsed.angle?.name ||
    !parsed.angle?.audience_pocket ||
    !parsed.angle?.core_message
  ) {
    throw new Error("Generator returned an unusable angle.");
  }

  const angle: GeneratedAngle = {
    name: parsed.angle.name,
    emotional_register: reg.data,
    audience_pocket: parsed.angle.audience_pocket,
    core_message: parsed.angle.core_message,
    visual_treatment: parsed.angle.visual_treatment ?? "",
    differentiator: parsed.angle.differentiator ?? "",
  };

  // Backstop: if the model violated diversity vs. siblings, surface it as
  // an error rather than silently returning a duplicate. Caller can retry.
  const dupRegister = input.siblings.some(
    (s) => s.emotional_register === angle.emotional_register
  );
  const dupPocket = input.siblings.some(
    (s) =>
      s.audience_pocket.trim().toLowerCase() ===
      angle.audience_pocket.trim().toLowerCase()
  );
  if (dupRegister || dupPocket) {
    throw new Error(
      "Replacement angle duplicates an existing register or audience pocket. Try again."
    );
  }

  return {
    angle,
    voiceProfileVersion: input.voiceProfile?.version ?? null,
    ...readUsage(response),
  };
}
