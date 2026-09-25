import { Company, KnowledgeArticle, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";
import { isManagerOrAbove, isSuperAdmin } from "@/lib/auth-helpers";
import { findAppDataSources } from "@/lib/knowledge-app-data";
import { findBroadAppDataSources } from "@/lib/knowledge-broad-data";
import { isKnowledgeOwner } from "@/lib/knowledge-owner";

export type KnowledgeViewer = {
  id: string;
  email: string;
  role: Role;
  company: Company;
  jobTitle: string | null;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  kind: "article" | "lesson" | "record";
  url: string;
  excerpt: string;
  updatedAt: string;
  dateKind: "source" | "entry";
};

const STOP_WORDS = new Set([
  "about", "are", "can", "could", "does", "for", "from", "how", "our",
  "the", "their", "there", "this", "what", "when", "where", "which", "who",
  "with", "would", "should", "you", "your",
]);

export async function getKnowledgeViewer(userId: string): Promise<KnowledgeViewer | null> {
  return prisma.user.findFirst({
    where: { id: userId, terminatedAt: null },
    select: { id: true, email: true, role: true, company: true, jobTitle: true },
  });
}

export function canReadKnowledgeArticle(
  article: Pick<KnowledgeArticle, "isPublished" | "company" | "allowedRoles">,
  viewer: KnowledgeViewer,
): boolean {
  if (isKnowledgeOwner(viewer)) return true;
  if (!article.isPublished) return false;
  if (isSuperAdmin(viewer.role)) return true;
  return (article.company === null || article.company === viewer.company) &&
    article.allowedRoles.includes(viewer.role);
}

export function knowledgeTerms(question: string): string[] {
  return [...new Set((question.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(word)))].slice(0, 10);
}

function excerptAround(text: string, terms: string[], maxLength = 1600): string {
  const lower = text.toLowerCase();
  const positions = terms.map((term) => lower.indexOf(term)).filter((at) => at >= 0);
  const start = positions.length ? Math.max(0, Math.min(...positions) - 160) : 0;
  const excerpt = text.slice(start, start + maxLength).trim();
  return `${start ? "…" : ""}${excerpt}${start + maxLength < text.length ? "…" : ""}`;
}

export function rankKnowledgeLessons<T extends { title: string; searchText: string }>(
  lessons: T[],
  terms: string[],
): T[] {
  return [...lessons].sort((a, b) => {
    const score = (lesson: T) => {
      const title = lesson.title.toLowerCase();
      const body = lesson.searchText.toLowerCase();
      const titleMatches = terms.filter((term) => title.includes(term)).length;
      const bodyMatches = terms.filter((term) => body.includes(term)).length;
      return titleMatches * 5 + bodyMatches * 2;
    };
    return score(b) - score(a);
  });
}

export async function findKnowledgeSources(
  viewer: KnowledgeViewer,
  question: string,
): Promise<KnowledgeSource[]> {
  if (!isKnowledgeOwner(viewer)) return [];
  const terms = knowledgeTerms(question);
  if (terms.length === 0) return [];
  const tsquery = terms.join(" | ");

  // Only the verified owner can reach this query. Drafts and all companies are
  // deliberately included for that account and marked for review in context.
  const articles = await prisma.$queryRaw<KnowledgeArticle[]>`
    SELECT "id", "title", "content", "category", "sourceLabel", "sourceUrl", "sourceUpdatedAt",
           "company", "allowedRoles", "isPublished", "createdById", "createdAt", "updatedAt"
    FROM "KnowledgeArticle"
    WHERE to_tsvector('english', "title" || ' ' || "content")
          @@ to_tsquery('english', ${tsquery})
    ORDER BY ts_rank(
      to_tsvector('english', "title" || ' ' || "content"),
      to_tsquery('english', ${tsquery})
    ) DESC, "updatedAt" DESC
    LIMIT 6
  `;

  const articleSources: KnowledgeSource[] = articles.map((article) => ({
    id: `article:${article.id}`,
    title: article.isPublished ? article.title : `[Draft] ${article.title}`,
    kind: "article",
    url: `/knowledge/articles/${article.id}`,
    excerpt: `${article.isPublished ? "" : "Unpublished draft; verify before relying on it.\n"}${excerptAround(article.content, terms)}`,
    updatedAt: (article.sourceUpdatedAt ?? article.updatedAt).toISOString(),
    dateKind: article.sourceUpdatedAt ? "source" : "entry",
  }));

  const visibleModuleIds = isManagerOrAbove(viewer.role)
    ? null
    : await getVisibleModuleIdsForUser(viewer.id, viewer.jobTitle, viewer.company);
  const lessons = visibleModuleIds?.size === 0 ? [] : await prisma.lesson.findMany({
    where: {
      OR: terms.flatMap((term) => [
        { searchText: { contains: term, mode: "insensitive" as const } },
        { title: { contains: term, mode: "insensitive" as const } },
      ]),
      subsection: {
        ...(visibleModuleIds ? { moduleId: { in: [...visibleModuleIds] } } : {}),
      },
    },
    select: {
      id: true,
      title: true,
      searchText: true,
      updatedAt: true,
      subsection: { select: { moduleId: true, module: { select: { title: true } } } },
    },
    take: 60,
  });
  const rankedLessons = rankKnowledgeLessons(lessons, terms);
  const prioritizedLessons = [
    ...rankedLessons.filter((lesson) => !lesson.subsection.module.title.startsWith("(Old)")),
    ...rankedLessons.filter((lesson) => lesson.subsection.module.title.startsWith("(Old)")),
  ];
  const lessonSources: KnowledgeSource[] = prioritizedLessons.slice(0, 6).map((lesson) => ({
    id: `lesson:${lesson.id}`,
    title: `${lesson.subsection.module.title.startsWith("(Old)") ? "[Legacy] " : ""}${lesson.title}`,
    kind: "lesson",
    url: `/modules/${lesson.subsection.moduleId}/lessons/${lesson.id}`,
    excerpt: `${lesson.subsection.module.title.startsWith("(Old)") ? `From legacy module ${lesson.subsection.module.title}; confirm this procedure is current.\n` : ""}${excerptAround(lesson.searchText, terms)}`,
    updatedAt: lesson.updatedAt.toISOString(),
    dateKind: "entry",
  }));

  const [appSources, broadSources] = await Promise.all([
    findAppDataSources(question, terms),
    findBroadAppDataSources(question),
  ]);
  return [
    ...(broadSources.length ? appSources.slice(0, 3) : appSources),
    ...broadSources,
    ...articleSources,
    ...lessonSources,
  ].slice(0, 10);
}
