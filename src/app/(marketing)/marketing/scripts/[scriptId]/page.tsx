import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMarketing } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getScriptPerformance } from "@/lib/marketing/performance";
import { ScriptEditor } from "./ScriptEditor";
import { ScriptPerformanceCard } from "./ScriptPerformanceCard";

export default async function ScriptDetailPage({
  params,
}: {
  params: Promise<{ scriptId: string }>;
}) {
  await requireMarketing();
  const { scriptId } = await params;

  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: {
      idea: { select: { id: true, title: true } },
      createdBy: { select: { id: true, name: true } },
      hooks: { orderBy: { order: "asc" } },
    },
  });
  if (!script) notFound();

  const performance = await getScriptPerformance(script.id, 30);

  return (
    <div className="max-w-4xl space-y-4">
      <div className="text-sm text-gray-500 space-x-2">
        <Link href="/marketing/ideas" className="hover:text-gray-700">
          Ideas
        </Link>
        <span>/</span>
        <Link
          href={`/marketing/ideas/${script.idea.id}`}
          className="hover:text-gray-700"
        >
          {script.idea.title}
        </Link>
        <span>/</span>
        <span className="text-gray-700">Script</span>
      </div>

      <ScriptPerformanceCard
        scriptId={script.id}
        metaAdSlug={script.metaAdSlug}
        performance={performance}
      />

      <ScriptEditor
        script={{
          id: script.id,
          ideaId: script.idea.id,
          ideaTitle: script.idea.title,
          body: script.body,
          platform: script.platform,
          status: script.status,
          notes: script.notes,
          voiceProfileVersion: script.voiceProfileVersion,
          model: script.model,
          metaAdSlug: script.metaAdSlug,
          createdByName: script.createdBy?.name ?? null,
          createdAt: script.createdAt.toISOString(),
          updatedAt: script.updatedAt.toISOString(),
          hooks: script.hooks.map((h) => ({
            id: h.id,
            label: h.label,
            text: h.text,
            order: h.order,
            status: h.status,
            notes: h.notes,
          })),
        }}
      />
    </div>
  );
}
