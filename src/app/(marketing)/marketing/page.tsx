import Link from "next/link";
import { requireMarketing } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getLatestVoiceProfile } from "@/lib/marketing/voice";

export default async function MarketingDashboardPage() {
  await requireMarketing();
  const [voiceProfile, ideaStatusCounts] = await Promise.all([
    getLatestVoiceProfile(),
    prisma.marketingIdea.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const ideaCounts = Object.fromEntries(
    ideaStatusCounts.map((row) => [row.status, row._count._all])
  );
  const activeIdeas =
    (ideaCounts.DRAFT ?? 0) + (ideaCounts.IN_PRODUCTION ?? 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
          <p className="text-gray-500 mt-1">
            Ideas, scripts, ad copy, and performance for Planet Pooch
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{activeIdeas}</p>
            <p className="text-sm text-gray-500">Active Ideas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-sm text-gray-500">Live Placements</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-sm text-gray-500">Running Experiments</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <p className="text-3xl font-bold text-gray-300">—</p>
            <p className="text-sm text-gray-500">Spend (7d)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-gray-900">
            Getting started
          </h2>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <Link
            href="/marketing/voice"
            className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-900">
              {voiceProfile
                ? `Voice Profile · v${voiceProfile.version}`
                : "Set up your Voice Profile"}
            </p>
            <p className="text-xs text-gray-500">
              {voiceProfile
                ? "Edit tone, do/don'ts, banned phrases, and exemplars. Every generator reads from the latest version."
                : "Tone, do/don'ts, banned phrases, and exemplars. Every generator will read from the latest version."}
            </p>
          </Link>
          <Link
            href="/marketing/ideas"
            className="block p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          >
            <p className="text-sm font-medium text-gray-900">
              Ideas
              {activeIdeas > 0 && (
                <span className="text-gray-500 font-normal">
                  {" "}· {activeIdeas} active
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              Capture seed insights. Scripts and ad copy will hang off these.
            </p>
          </Link>
          <p className="text-sm text-gray-500">
            Next up: the first generator — turn an idea into 3 scripts × 5
            hooks each.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
