import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth-helpers";
import { canReadKnowledgeArticle, getKnowledgeViewer } from "@/lib/knowledge";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";
import { prisma } from "@/lib/prisma";

export default async function KnowledgeArticlePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuth();
  const viewer = await getKnowledgeViewer(session.user.id);
  const { id } = await params;
  const article = await prisma.knowledgeArticle.findUnique({ where: { id } });
  if (!viewer || !isKnowledgeOwner(viewer) || !article || !canReadKnowledgeArticle(article, viewer)) notFound();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/knowledge" className="text-sm text-pp-accent hover:underline">← Back to Ask Pooch</Link>
      <div>
        <p className="text-xs uppercase tracking-wide text-pp-ink-4">{article.category}</p>
        <h1 className="mt-1 text-3xl font-semibold text-pp-ink">{article.title}</h1>
        <p className="mt-2 text-sm text-pp-ink-3">Updated {article.updatedAt.toLocaleDateString("en-US")}</p>
        {article.sourceUpdatedAt && <p className="mt-1 text-sm text-pp-ink-3">Original source updated {article.sourceUpdatedAt.toLocaleDateString("en-US")}</p>}
      </div>
      <div className="whitespace-pre-wrap rounded-xl border border-pp-line bg-white p-6 text-sm leading-7 text-pp-ink-2">
        {article.content}
      </div>
      {article.sourceUrl && /^https?:\/\//i.test(article.sourceUrl) && (
        <p className="text-sm text-pp-ink-3">
          Original source: <a href={article.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-pp-accent underline">
            {article.sourceLabel || article.sourceUrl}
          </a>
        </p>
      )}
    </div>
  );
}
