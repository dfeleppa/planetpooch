import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMarketing } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { IdeaEditor } from "./IdeaEditor";
import { AngleReview } from "./AngleReview";
import { ScriptsSection } from "./ScriptsSection";
import { ContentAssetsSection } from "./ContentAssetsSection";

export default async function IdeaDetailPage({
  params,
}: {
  params: Promise<{ ideaId: string }>;
}) {
  await requireMarketing();
  const { ideaId } = await params;

  const idea = await prisma.marketingIdea.findUnique({
    where: { id: ideaId },
    include: {
      createdBy: { select: { id: true, name: true } },
      angles: { orderBy: { createdAt: "asc" } },
      scripts: {
        orderBy: { createdAt: "desc" },
        include: {
          angle: { select: { id: true, name: true, emotionalRegister: true } },
        },
      },
      adAssets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!idea) notFound();

  return (
    <div className="w-full space-y-4">
      <div>
        <Link
          href="/marketing/create"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Create Ads
        </Link>
      </div>

      <IdeaEditor
        idea={{
          id: idea.id,
          title: idea.title,
          insight: idea.insight,
          audience: idea.audience,
          serviceLine: idea.serviceLine,
          objective: idea.objective,
          channels: idea.channels,
          offer: idea.offer,
          proof: idea.proof,
          status: idea.status,
          tags: idea.tags,
          notes: idea.notes,
          createdByName: idea.createdBy?.name ?? null,
          createdAt: idea.createdAt.toISOString(),
          updatedAt: idea.updatedAt.toISOString(),
        }}
      />

      <ContentAssetsSection
        ideaId={idea.id}
        initialAssets={idea.adAssets.map((asset) => ({
          id: asset.id,
          name: asset.name,
          type: asset.type,
          status: asset.status,
          content: asset.content,
          model: asset.model,
          createdAt: asset.createdAt.toISOString(),
        }))}
      />

      <details className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <summary className="cursor-pointer px-6 py-4 text-sm font-medium text-gray-800">
          Advanced concept and video-script development
          <span className="ml-2 text-xs font-normal text-gray-500">
            Angles, scripts, and hook testing
          </span>
        </summary>
        <div className="space-y-4 border-t border-gray-100 p-4">
          <AngleReview ideaId={idea.id} angles={idea.angles} />
          <ScriptsSection
            scripts={idea.scripts.map((s) => ({
              id: s.id,
              hook: s.hook,
              body: s.body,
              status: s.status,
              platform: s.platform,
              createdAt: s.createdAt.toISOString(),
              voiceProfileVersion: s.voiceProfileVersion,
              angle: s.angle
                ? {
                    id: s.angle.id,
                    name: s.angle.name,
                    emotionalRegister: s.angle.emotionalRegister,
                  }
                : null,
            }))}
          />
        </div>
      </details>
    </div>
  );
}
