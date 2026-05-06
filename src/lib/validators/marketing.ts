import { z } from "zod";

// ── Andromeda enums (mirrored from Prisma so the validator layer stays
//    decoupled from generated client types) ────────────────────────────────

export const EmotionalRegisterSchema = z.enum([
  "FEAR",
  "ASPIRATION",
  "HUMOR",
  "LOGIC",
  "PRIDE",
  "CURIOSITY",
  "NOSTALGIA",
  "COMMUNITY",
]);
export type EmotionalRegister = z.infer<typeof EmotionalRegisterSchema>;

export const AngleStatusSchema = z.enum([
  "DRAFT",
  "SELECTED",
  "GENERATED",
  "DISCARDED",
]);
export type AngleStatus = z.infer<typeof AngleStatusSchema>;

// Proof bank entry — what the script generator pulls from when writing
// "real results" claims. `kind` keeps the prompt rendering opinionated
// ("Stat:" vs "Testimonial:" headers) and gives the model a hint about
// how to use it.
export const ProofBankEntrySchema = z.object({
  kind: z.enum(["stat", "testimonial", "transformation", "story"]),
  text: z.string().trim().min(1).max(2000),
  source: z.string().trim().max(500).optional(),
});
export type ProofBankEntry = z.infer<typeof ProofBankEntrySchema>;

/**
 * Voice profile save payload. Saving creates a new version row rather than
 * mutating the existing one, so every field is taken at face value. Empty
 * strings are valid — the team may have a partial profile early on.
 */
export const SaveVoiceProfileSchema = z.object({
  tone: z.string().trim().max(5000).default(""),
  doRules: z.string().trim().max(10000).default(""),
  dontRules: z.string().trim().max(10000).default(""),
  bannedPhrases: z.array(z.string().trim().min(1).max(200)).max(200).default([]),
  complianceRules: z.string().trim().max(10000).default(""),
  exemplars: z.string().trim().max(50000).default(""),
  notes: z.string().trim().max(5000).default(""),
  targetAudience: z.string().trim().max(5000).default(""),
  problemSolved: z.string().trim().max(5000).default(""),
  offer: z.string().trim().max(5000).default(""),
  offerMechanism: z.string().trim().max(5000).default(""),
  pricing: z.string().trim().max(5000).default(""),
  beforeAfterState: z.string().trim().max(5000).default(""),
  primaryObjections: z.string().trim().max(5000).default(""),
  acquisitionChannels: z.string().trim().max(5000).default(""),
  growthConstraint: z.string().trim().max(5000).default(""),
  uniqueMechanism: z.string().trim().max(5000).default(""),

  // Andromeda-era fields. tonalRange caps which emotional registers the
  // angle generator may produce; forbiddenTerritory is plain prose the model
  // is told to avoid; proofBank seeds factual claims; visualIdentityGuardrails
  // anchors shot lists in the brand's actual on-camera identity.
  tonalRange: z.array(EmotionalRegisterSchema).max(8).default([]),
  forbiddenTerritory: z.string().trim().max(5000).default(""),
  proofBank: z.array(ProofBankEntrySchema).max(100).default([]),
  visualIdentityGuardrails: z.string().trim().max(5000).default(""),
});

export type SaveVoiceProfileInput = z.infer<typeof SaveVoiceProfileSchema>;

// ── Marketing ideas ─────────────────────────────────────────────────────────

export const ServiceLineSchema = z.enum([
  "GROOMING",
  "DAYCARE",
  "BOARDING",
  "TRAINING",
  "MULTIPLE",
]);

export const IdeaStatusSchema = z.enum([
  "DRAFT",
  "IN_PRODUCTION",
  "SHIPPED",
  "ARCHIVED",
]);

export const CreateMarketingIdeaSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200),
  insight: z.string().trim().max(5000).default(""),
  audience: z.string().trim().max(500).default(""),
  serviceLine: ServiceLineSchema,
  tags: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  notes: z.string().trim().max(2000).default(""),
});

export const UpdateMarketingIdeaSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  insight: z.string().trim().max(5000).optional(),
  audience: z.string().trim().max(500).optional(),
  serviceLine: ServiceLineSchema.optional(),
  status: IdeaStatusSchema.optional(),
  tags: z.array(z.string().trim().min(1).max(50)).max(20).optional(),
  notes: z.string().trim().max(2000).optional(),
});

export type CreateMarketingIdeaInput = z.infer<typeof CreateMarketingIdeaSchema>;
export type UpdateMarketingIdeaInput = z.infer<typeof UpdateMarketingIdeaSchema>;

// ── Scripts + Hooks ─────────────────────────────────────────────────────────

export const PlatformSchema = z.enum([
  "REELS",
  "TIKTOK",
  "YT_SHORTS",
  "META_FEED",
  "FB_FEED",
  "MULTI",
]);

export const ScriptStatusSchema = z.enum([
  "DRAFT",
  "APPROVED",
  "FILMED",
  "POSTED",
  "ARCHIVED",
]);

export const HookStatusSchema = z.enum([
  "DRAFT",
  "APPROVED",
  "REJECTED",
  "WINNER",
]);

// Whitelist of models the generator is allowed to call. Keeping this server-side
// stops a client from passing an arbitrary model id and racking up cost.
export const ScriptModelSchema = z.enum([
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
]);

export type ScriptModel = z.infer<typeof ScriptModelSchema>;

// ── Andromeda-era request payloads ──────────────────────────────────────────

/** Step 1: generate 6–10 angles for an idea. */
export const GenerateAnglesRequestSchema = z.object({
  model: ScriptModelSchema.default("claude-haiku-4-5"),
});

/** Step 1b: re-roll a single angle (replaces the existing row). */
export const RegenerateAngleRequestSchema = z.object({
  model: ScriptModelSchema.default("claude-haiku-4-5"),
  /// Free-text nudge from the strategist ("punchier", "less fear, more pride").
  /// Optional — if absent the model just regenerates with diversity-vs-siblings
  /// as the only constraint.
  guidance: z.string().trim().max(500).optional(),
});

/** Step 1c: edit / discard / re-status an angle by hand. */
export const UpdateAngleSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  emotionalRegister: EmotionalRegisterSchema.optional(),
  audiencePocket: z.string().trim().min(1).max(500).optional(),
  coreMessage: z.string().trim().min(1).max(1000).optional(),
  visualTreatment: z.string().trim().min(1).max(500).optional(),
  differentiator: z.string().trim().min(1).max(1000).optional(),
  status: AngleStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
});

/** Step 2: fan out script generation across selected angles. */
export const GenerateScriptsFromAnglesSchema = z.object({
  angleIds: z.array(z.string().min(1)).min(1).max(6),
  platform: PlatformSchema.default("MULTI"),
  model: ScriptModelSchema.default("claude-haiku-4-5"),
});

/** Step 4: opt-in hook variants for a winning script. */
export const GenerateHookVariantsSchema = z.object({
  count: z.number().int().min(2).max(8).default(4),
  model: ScriptModelSchema.default("claude-haiku-4-5"),
});

// Slug constraint: short, ascii-printable, copy-paste-safe into Meta ad
// names. Lowercase letters, digits, dashes; 3-40 chars. Empty string clears
// the slug (sent over the wire as null).
export const MetaAdSlugSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/,
    "Use lowercase letters, digits, and dashes (3-40 chars)."
  );

export const UpdateScriptSchema = z.object({
  body: z.string().max(20000).optional(),
  hook: z.string().max(2000).optional(),
  cta: z.string().max(2000).optional(),
  shotList: z.array(z.string().trim().min(1).max(500)).max(20).optional(),
  onScreenTextStyle: z.string().trim().max(200).optional(),
  musicTone: z.string().trim().max(200).optional(),
  lengthTarget: z.string().trim().max(50).optional(),
  platform: PlatformSchema.optional(),
  status: ScriptStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
  // Empty string → null (clears the slug); otherwise validate the slug.
  metaAdSlug: z
    .union([z.literal(""), MetaAdSlugSchema])
    .optional()
    .transform((v) => (v === "" ? null : v)),
});

export const UpdateHookSchema = z.object({
  label: z.string().trim().max(200).optional(),
  text: z.string().trim().min(1).max(2000).optional(),
  status: HookStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
  order: z.number().int().nonnegative().optional(),
});

export type GenerateAnglesRequestInput = z.infer<typeof GenerateAnglesRequestSchema>;
export type RegenerateAngleRequestInput = z.infer<typeof RegenerateAngleRequestSchema>;
export type UpdateAngleInput = z.infer<typeof UpdateAngleSchema>;
export type GenerateScriptsFromAnglesInput = z.infer<typeof GenerateScriptsFromAnglesSchema>;
export type GenerateHookVariantsInput = z.infer<typeof GenerateHookVariantsSchema>;
export type UpdateScriptInput = z.infer<typeof UpdateScriptSchema>;
export type UpdateHookInput = z.infer<typeof UpdateHookSchema>;
