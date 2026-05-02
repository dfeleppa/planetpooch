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
