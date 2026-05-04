import { z } from "zod";

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

export const GenerateScriptsRequestSchema = z.object({
  scriptCount: z.number().int().min(1).max(5).default(3),
  hooksPerScript: z.number().int().min(1).max(10).default(5),
  platform: PlatformSchema.default("MULTI"),
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

export type GenerateScriptsRequestInput = z.infer<
  typeof GenerateScriptsRequestSchema
>;
export type UpdateScriptInput = z.infer<typeof UpdateScriptSchema>;
export type UpdateHookInput = z.infer<typeof UpdateHookSchema>;
