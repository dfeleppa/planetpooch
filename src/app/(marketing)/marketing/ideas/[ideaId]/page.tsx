import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMarketing } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { IdeaEditor } from "./IdeaEditor";
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
      scripts: {
        orderBy: { createdAt: "desc" },
        include: {
          hooks: { orderBy: { order: "asc" }, select: { id: true, text: true } },
        },
      },
    },
  });
  if (!idea) notFound();

  return (
    <div className="max-w-3xl space-y-4">
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

      <ScriptsSection
        ideaId={idea.id}
        scripts={idea.scripts.map((s) => ({
          id: s.id,
          body: s.body,
          status: s.status,
          platform: s.platform,
          hookCount: s.hooks.length,
          firstHookText: s.hooks[0]?.text ?? "",
          createdAt: s.createdAt.toISOString(),
          voiceProfileVersion: s.voiceProfileVersion,
        }))}
      />
    </div>
  );
}
