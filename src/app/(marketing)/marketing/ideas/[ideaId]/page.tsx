import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMarketing } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { IdeaEditor } from "./IdeaEditor";
import { AngleReview } from "./AngleReview";
import { ScriptsSection } from "./ScriptsSection";

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
    },
  });
  if (!idea) notFound();

  return (
    <div className="w-full space-y-4">
      <div>
        <Link
          href="/marketing/ideas"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to ideas
        </Link>
      </div>

      <IdeaEditor
        idea={{
          id: idea.id,
          title: idea.title,
          insight: idea.insight,
          audience: idea.audience,
          serviceLine: idea.serviceLine,
          status: idea.status,
          tags: idea.tags,
          notes: idea.notes,
          createdByName: idea.createdBy?.name ?? null,
          createdAt: idea.createdAt.toISOString(),
          updatedAt: idea.updatedAt.toISOString(),
        }}
      />

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
  );
}
