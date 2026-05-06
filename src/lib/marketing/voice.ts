import { prisma } from "@/lib/prisma";
import type { BrandVoiceProfile } from "@prisma/client";
import {
  ProofBankEntrySchema,
  type ProofBankEntry,
  type SaveVoiceProfileInput,
} from "@/lib/validators/marketing";

/**
 * Parse the JSON `proofBank` column into a typed array. Stored as Json so
 * the row can grow without a migration; validated on read so a malformed
 * row doesn't blow up generation.
 */
export function readProofBank(profile: BrandVoiceProfile | null): ProofBankEntry[] {
  if (!profile) return [];
  const raw = profile.proofBank;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = ProofBankEntrySchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Returns the highest-version voice profile, or `null` if none have been
 * saved yet. Generators should call this and stamp `version` on whatever
 * they produce so quality regressions can be traced back to a specific edit.
 */
export async function getLatestVoiceProfile(): Promise<BrandVoiceProfile | null> {
  return prisma.brandVoiceProfile.findFirst({
    orderBy: { version: "desc" },
  });
}

/**
 * Insert a new version. Computes the next version as `max(version) + 1`.
 * Editing volume is low (one marketing lead) so we don't bother with a
 * sequence — a transaction is enough to keep concurrent saves consistent.
 */
export async function saveNewVoiceProfileVersion(
  input: SaveVoiceProfileInput,
  createdById: string | null
): Promise<BrandVoiceProfile> {
  return prisma.$transaction(async (tx) => {
    const latest = await tx.brandVoiceProfile.findFirst({
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;
    return tx.brandVoiceProfile.create({
      data: {
        version: nextVersion,
        tone: input.tone,
        doRules: input.doRules,
        dontRules: input.dontRules,
        bannedPhrases: input.bannedPhrases,
        complianceRules: input.complianceRules,
        exemplars: input.exemplars,
        notes: input.notes,
        targetAudience: input.targetAudience,
        problemSolved: input.problemSolved,
        offer: input.offer,
        offerMechanism: input.offerMechanism,
        pricing: input.pricing,
        beforeAfterState: input.beforeAfterState,
        primaryObjections: input.primaryObjections,
        acquisitionChannels: input.acquisitionChannels,
        growthConstraint: input.growthConstraint,
        uniqueMechanism: input.uniqueMechanism,
        tonalRange: input.tonalRange,
        forbiddenTerritory: input.forbiddenTerritory,
        proofBank: input.proofBank,
        visualIdentityGuardrails: input.visualIdentityGuardrails,
        createdById,
      },
    });
  });
}

/**
 * Compact representation of a voice profile suitable for embedding in an LLM
 * system prompt. Returns an empty string if no profile exists yet — callers
 * should check for that and surface a "set up your voice profile first" UX.
 */
export function renderVoiceProfileForPrompt(
  profile: BrandVoiceProfile | null
): string {
  if (!profile) return "";
  const sections: string[] = [];

  const businessFields: Array<[string, string]> = [
    ["Target audience", profile.targetAudience],
    ["Problem we solve", profile.problemSolved],
    ["Offer", profile.offer],
    ["How the offer works", profile.offerMechanism],
    ["Pricing", profile.pricing],
    ["Before/after state", profile.beforeAfterState],
    ["Primary objections", profile.primaryObjections],
    ["Acquisition channels", profile.acquisitionChannels],
    ["Growth constraint", profile.growthConstraint],
    ["Unique mechanism (why us)", profile.uniqueMechanism],
  ];
  const businessBody = businessFields
    .filter(([, v]) => v && v.trim().length > 0)
    .map(([label, v]) => `## ${label}\n${v}`)
    .join("\n\n");
  if (businessBody) {
    sections.push(`# Business context\n${businessBody}`);
  }

  if (profile.tone) sections.push(`# Tone\n${profile.tone}`);

  // Andromeda: tonal range caps the angle generator's emotional registers.
  // Emit it even when empty so the model knows the constraint exists — empty
  // means "no cap, use any register".
  if (profile.tonalRange.length > 0) {
    sections.push(
      `# Tonal range (the only emotional registers the angle generator may use)\n` +
        profile.tonalRange.map((r) => `- ${r}`).join("\n")
    );
  }

  if (profile.doRules) sections.push(`# Do\n${profile.doRules}`);
  if (profile.dontRules) sections.push(`# Don't\n${profile.dontRules}`);

  if (profile.forbiddenTerritory) {
    sections.push(
      `# Forbidden territory (never frame an angle around any of these)\n${profile.forbiddenTerritory}`
    );
  }

  if (profile.bannedPhrases.length > 0) {
    sections.push(
      `# Banned phrases (never use these)\n` +
        profile.bannedPhrases.map((p) => `- ${p}`).join("\n")
    );
  }

  // Proof bank: flatten to markdown lines per kind so the model can scan and
  // pick a citation rather than parsing JSON. Empty bank → omit the section.
  const proofBank = readProofBank(profile);
  if (proofBank.length > 0) {
    const KIND_LABEL: Record<ProofBankEntry["kind"], string> = {
      stat: "Stat",
      testimonial: "Testimonial",
      transformation: "Transformation",
      story: "Story",
    };
    const lines = proofBank.map((e) => {
      const src = e.source ? ` _(${e.source})_` : "";
      return `- **${KIND_LABEL[e.kind]}:** ${e.text}${src}`;
    });
    sections.push(
      `# Proof bank (anchor every "real results" claim to one of these — never invent stats, names, or transformations)\n${lines.join("\n")}`
    );
  }

  if (profile.visualIdentityGuardrails) {
    sections.push(
      `# Visual identity guardrails (what the brand looks like on camera — keep shot lists consistent with these)\n${profile.visualIdentityGuardrails}`
    );
  }

  if (profile.complianceRules) {
    sections.push(`# Compliance rules\n${profile.complianceRules}`);
  }
  if (profile.exemplars) {
    sections.push(`# Exemplar scripts (these performed well — match this energy)\n${profile.exemplars}`);
  }
  return sections.join("\n\n");
}
