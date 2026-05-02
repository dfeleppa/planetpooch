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
