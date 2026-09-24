CREATE TABLE "KnowledgeArticle" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'General',
  "sourceLabel" TEXT,
  "sourceUrl" TEXT,
  "sourceUpdatedAt" TIMESTAMP(3),
  "company" "Company",
  "allowedRoles" "Role"[] NOT NULL DEFAULT ARRAY['SUPER_ADMIN']::"Role"[],
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeArticle_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeArticle_isPublished_company_updatedAt_idx"
  ON "KnowledgeArticle"("isPublished", "company", "updatedAt");
CREATE INDEX "KnowledgeArticle_category_idx" ON "KnowledgeArticle"("category");
CREATE INDEX "KnowledgeArticle_search_idx" ON "KnowledgeArticle"
  USING GIN (to_tsvector('english', "title" || ' ' || "content"));

-- NextAuth credentials and role checks live in the app, not Supabase Auth.
-- Keep this table private to the server's database connection.
ALTER TABLE "KnowledgeArticle" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "KnowledgeArticle" FROM PUBLIC, anon, authenticated;
