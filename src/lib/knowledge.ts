import { Company, KnowledgeArticle, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";
import { isManagerOrAbove, isSuperAdmin } from "@/lib/auth-helpers";

export type KnowledgeViewer = {
  id: string;
  role: Role;
  company: Company;
  jobTitle: string | null;
};

export type KnowledgeSource = {
  id: string;
  title: string;
  kind: "article" | "lesson";
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
    select: { id: true, role: true, company: true, jobTitle: true },
  });
}

export function canReadKnowledgeArticle(
  article: Pick<KnowledgeArticle, "isPublished" | "company" | "allowedRoles">,
  viewer: KnowledgeViewer,
): boolean {
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
  const terms = knowledgeTerms(question);
  if (terms.length === 0) return [];
  const tsquery = terms.join(" | ");

  // Apply company and role checks in SQL, before reading document text into
  // the application or sending any passage to OpenAI.
  const articles = await prisma.$queryRaw<KnowledgeArticle[]>`
    SELECT "id", "title", "content", "category", "sourceLabel", "sourceUrl", "sourceUpdatedAt",
           "company", "allowedRoles", "isPublished", "createdById", "createdAt", "updatedAt"
    FROM "KnowledgeArticle"
    WHERE "isPublished" = true
      AND (${isSuperAdmin(viewer.role)} OR (
        ("company" IS NULL OR "company" = ${viewer.company}::"Company")
        AND ${viewer.role}::"Role" = ANY("allowedRoles")
      ))
      AND to_tsvector('english', "title" || ' ' || "content")
          @@ to_tsquery('english', ${tsquery})
    ORDER BY ts_rank(
      to_tsvector('english', "title" || ' ' || "content"),
      to_tsquery('english', ${tsquery})
    ) DESC, "updatedAt" DESC
    LIMIT 6
  `;

  const articleSources: KnowledgeSource[] = articles.map((article) => ({
    id: `article:${article.id}`,
    title: article.title,
    kind: "article",
    url: `/knowledge/articles/${article.id}`,
    excerpt: excerptAround(article.content, terms),
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
        module: { title: { not: { startsWith: "(Old)" } } },
        ...(visibleModuleIds ? { moduleId: { in: [...visibleModuleIds] } } : {}),
      },
    },
    select: {
      id: true,
      title: true,
      searchText: true,
      updatedAt: true,
      subsection: { select: { moduleId: true } },
    },
    take: 60,
  });
  const lessonSources: KnowledgeSource[] = rankKnowledgeLessons(lessons, terms).slice(0, 6).map((lesson) => ({
    id: `lesson:${lesson.id}`,
    title: lesson.title,
    kind: "lesson",
    url: `/modules/${lesson.subsection.moduleId}/lessons/${lesson.id}`,
    excerpt: excerptAround(lesson.searchText, terms),
    updatedAt: lesson.updatedAt.toISOString(),
    dateKind: "entry",
  }));

  return [...articleSources, ...lessonSources].slice(0, 8);
}
