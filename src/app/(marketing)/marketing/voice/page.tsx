import { requireMarketing } from "@/lib/auth-helpers";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";
import { VoiceProfileEditor } from "./VoiceProfileEditor";

export default async function VoiceProfilePage() {
  await requireMarketing();
  const profile = await getLatestVoiceProfile();

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Brand Voice Profile</h1>
        <p className="text-gray-500 mt-1">
          Every script, hook, and ad copy generator reads from the latest
          version. Saving creates a new version — older ones are kept so we
          can correlate quality changes to specific edits.
        </p>
      </div>

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
                createdAt: profile.createdAt.toISOString(),
              }
            : null
        }
      />
    </div>
  );
}
