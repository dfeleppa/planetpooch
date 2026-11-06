import { PageHeader } from "@/components/ui/PageHeader";
import { requireMarketing } from "@/lib/auth-helpers";
import { getLatestVoiceProfile, readProofBank } from "@/lib/marketing/voice";
import { VoiceProfileEditor } from "./VoiceProfileEditor";

export default async function VoiceProfilePage() {
  await requireMarketing();
  const profile = await getLatestVoiceProfile();

  return (
    <div className="w-full">
      <PageHeader title="Brand Voice Profile" description="\r\n          Every script, hook, and ad copy generator reads from the latest\r\n          version. Saving creates a new version — older ones are kept so we\r\n          can correlate quality changes to specific edits.\r\n        " className="mb-6" />

      <VoiceProfileEditor
        initial={
          profile
            ? {
                version: profile.version,
                tone: profile.tone,
                doRules: profile.doRules,
                dontRules: profile.dontRules,
                bannedPhrases: profile.bannedPhrases,
                complianceRules: profile.complianceRules,
                exemplars: profile.exemplars,
                notes: profile.notes,
                targetAudience: profile.targetAudience,
                problemSolved: profile.problemSolved,
                offer: profile.offer,
                offerMechanism: profile.offerMechanism,
                pricing: profile.pricing,
                beforeAfterState: profile.beforeAfterState,
                primaryObjections: profile.primaryObjections,
                acquisitionChannels: profile.acquisitionChannels,
                growthConstraint: profile.growthConstraint,
                uniqueMechanism: profile.uniqueMechanism,
                tonalRange: profile.tonalRange,
                forbiddenTerritory: profile.forbiddenTerritory,
                proofBank: readProofBank(profile),
                visualIdentityGuardrails: profile.visualIdentityGuardrails,
                createdAt: profile.createdAt.toISOString(),
              }
            : null
        }
      />
    </div>
  );
}
