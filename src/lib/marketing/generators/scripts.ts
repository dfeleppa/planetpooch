import Anthropic from "@anthropic-ai/sdk";
import type { Angle, BrandVoiceProfile, ServiceLine } from "@prisma/client";
import type { ScriptModel } from "@/lib/validators/marketing";
import {
  buildSharedSystemPrefix,
  extractJson,
  readUsage,
  requireApiKey,
  type Usage,
} from "./shared";

/**
 * The script generator runs ONCE PER SELECTED ANGLE, in parallel. The
 * strategist already chose the angle in the review step — this prompt's
 * job is to execute that angle faithfully and concretely, NOT to generate
 * alternatives. Hook variants are an opt-in post-hoc feature (see
 * hookVariants.ts), reserved for scripts that have already proven
 * themselves with ad spend.
 */
const SCRIPT_FRAME = `You are a senior short-form video script writer. Your job is to take
ONE pre-approved angle and write ONE complete script for it: hook,
body, CTA, shot list, and treatment metadata.

# Your job is NOT to generate alternatives
You write ONE hook, not a menu. You write ONE body, not variants.
The strategist already chose this angle. Your job is to execute it
faithfully and concretely. If you find yourself wanting to hedge with
"or alternatively…", stop — pick the strongest version and commit.

# Stay inside the angle
Every part of the script must serve the angle you were given:
- The hook's emotional pull MUST match the angle's emotional_register.
  If the register is "humor", the hook is funny. If it's "fear", the
  hook names a specific fear. Don't soften the register to be safe.
- The script must read like it's aimed at the angle's audience_pocket.
  A "late-night new puppy parent" hears a different opening than
  "owner burned by cage boarding."
- The visual treatment in the angle dictates the shot list. UGC talking
  head means one face, one camera. Split-screen means two parallel
  shots throughout. Don't drift toward generic b-roll if the treatment
  was specific.

# How to write the hook (first 2–3 seconds)
- Pay off the angle's core_message in the very first line, in the
  voice of the audience pocket
- Concrete sensory detail over abstraction (cage, glass, vet smell,
  3am whining) — never "if you love your dog…"
- Reads like one sentence a real person would say to a friend
- One hook only. Do not return variants.

# How to write the body (~80–200 words after the hook)
- Pay off the hook in the next 3–5 seconds — no setup, no preamble
- Walk through 2–4 concrete differentiators with sensory specifics,
  not feature lists
- Anchor "real results" claims to proof_bank entries. If a claim isn't
  in the proof bank, cut it or replace it with one that is.
- End with the CTA (see below)

# How to write the CTA
- Soft, action-shaped, low-friction ("DM us 'tour' for a same-week
  walkthrough", "Link in bio for our suite cam")
- NEVER "call now", "limited time", "act fast"
- The CTA can be near-identical across scripts for the same idea —
  this is the constant. Don't reinvent it per angle.

# Shot list
- 4–8 concrete shots, in order
- Each shot is one line: what's on camera, in 5–15 words
- Match the visual_treatment from the angle. If treatment is "UGC
  talking head", the shot list is talking-head beats with B-roll
  cutaways named explicitly. If treatment is "split-screen", every
  shot is a split.
- Specific over generic: "groomer toweling a soaked golden in the van"
  beats "grooming footage"

# Treatment metadata
- on_screen_text_style: pick one and commit
- music_tone: one short phrase
- length_target: pick "15s", "30s", or "60s" based on how much room
  the body needs

# Self-check before you return
- Does the hook match the angle's emotional_register? If you'd
  describe the hook with a different register, rewrite it.
- Are all "real results" claims grounded in the proof bank? If not,
  cut or swap them.
- Does the shot list match visual_treatment, or did you drift into
  generic b-roll?
- Did you write more than one hook? If so, pick the strongest and
  delete the rest.

# Output format
Return STRICT JSON matching the requested schema. No markdown,
no commentary outside the JSON.`;

const SCRIPT_SCHEMA = {
  type: "object" as const,
  properties: {
    angle_name: { type: "string" as const },
    hook: {
      type: "string" as const,
      description: "Single sentence, the first 2–3 seconds.",
    },
    body: {
      type: "string" as const,
      description: "~80–200 words, excludes the hook.",
    },
    cta: { type: "string" as const, description: "Soft CTA." },
    shot_list: {
      type: "array" as const,
      minItems: 4,
      maxItems: 8,
      items: { type: "string" as const },
    },
    on_screen_text_style: { type: "string" as const },
    music_tone: { type: "string" as const },
    length_target: {
      type: "string" as const,
      enum: ["15s", "30s", "60s"],
    },
  },
  required: [
    "angle_name",
    "hook",
    "body",
    "cta",
    "shot_list",
    "on_screen_text_style",
    "music_tone",
    "length_target",
  ],
  additionalProperties: false,
};

export type GeneratedScript = {
  angle_name: string;
  hook: string;
  body: string;
  cta: string;
  shot_list: string[];
  on_screen_text_style: string;
  music_tone: string;
  length_target: "15s" | "30s" | "60s";
};

export type ScriptGenerationResult = {
  script: GeneratedScript;
  voiceProfileVersion: number | null;
} & Usage;

function buildUserMessage(input: {
  ideaTitle: string;
  insight: string;
  angle: Angle;
}): string {
  return [
    `# Idea\n${input.ideaTitle}`,
    `# Insight\n${input.insight}`,
    `# Angle (the one you were assigned — execute this faithfully)\n` +
      `Name: ${input.angle.name}\n` +
      `Emotional register: ${input.angle.emotionalRegister}\n` +
      `Audience pocket: ${input.angle.audiencePocket}\n` +
      `Core message: ${input.angle.coreMessage}\n` +
      `Visual treatment: ${input.angle.visualTreatment}\n` +
      `Why this angle is distinct: ${input.angle.differentiator}`,
    `# Task\nWrite ONE complete script that executes this angle. Hook + body + CTA + shot list + treatment metadata. Pull every "real results" claim from the proof bank.`,
  ].join("\n\n");
}

/**
 * Generate ONE full script for ONE angle. Caller fans out across selected
 * angles via Promise.all — the cacheable system prefix is identical across
 * sibling calls so all but the first hit cache-read rates on the voice
 * profile + service-line context.
 */
export async function generateScriptForAngle(input: {
  ideaTitle: string;
  insight: string;
  serviceLine: ServiceLine;
  angle: Angle;
  voiceProfile: BrandVoiceProfile | null;
  model: ScriptModel;
}): Promise<ScriptGenerationResult> {
  requireApiKey();
  const client = new Anthropic();

  const response = await client.messages.create({
    model: input.model,
    max_tokens: 4000,
    system: [
      buildSharedSystemPrefix(input.voiceProfile, input.serviceLine),
      { type: "text", text: SCRIPT_FRAME },
    ],
    output_config: {
      format: { type: "json_schema", schema: SCRIPT_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: buildUserMessage({
          ideaTitle: input.ideaTitle,
          insight: input.insight,
          angle: input.angle,
        }),
      },
    ],
  });

  const parsed = extractJson<GeneratedScript>(response);
  if (!parsed.hook || !parsed.body) {
    throw new Error("Generator returned an incomplete script.");
  }

  return {
    script: parsed,
    voiceProfileVersion: input.voiceProfile?.version ?? null,
    ...readUsage(response),
  };
}
