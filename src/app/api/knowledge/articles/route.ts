import { Company, Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { isBusinessSwitchOriginAllowed } from "@/lib/business";
import { getKnowledgeViewer } from "@/lib/knowledge";
import { prisma } from "@/lib/prisma";

const articleSchema = z.object({
  id: z.string().cuid().optional(),
  title: z.string().trim().min(3).max(180),
  content: z.string().trim().min(10).max(100000),
  category: z.string().trim().min(2).max(80),
  sourceLabel: z.string().trim().max(180).nullable(),
  sourceUrl: z.union([z.url().refine((value) => /^https?:\/\//i.test(value)), z.literal("")]).nullable(),
  sourceUpdatedAt: z.coerce.date().nullable(),
  company: z.enum(Company).nullable(),
  allowedRoles: z.array(z.enum(Role)).min(1),
  isPublished: z.boolean(),
});

async function authorizedAdmin() {
  const session = await getSession();
  if (!session?.user?.id) return null;
  const viewer = await getKnowledgeViewer(session.user.id);
  return viewer && isSuperAdmin(viewer.role) ? viewer : null;
}

export async function GET(request: Request) {
  if (!await authorizedAdmin()) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const id = new URL(request.url).searchParams.get("id");
  if (id) {
    const article = await prisma.knowledgeArticle.findUnique({ where: { id } });
    return article ? NextResponse.json(article) : NextResponse.json({ error: "Article not found." }, { status: 404 });
  }
  const articles = await prisma.knowledgeArticle.findMany({
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true, title: true, category: true, company: true,
      allowedRoles: true, isPublished: true, updatedAt: true,
    },
  });
  return NextResponse.json(articles);
}

export async function POST(request: Request) {
  const admin = await authorizedAdmin();
  if (!admin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!isBusinessSwitchOriginAllowed(request.headers.get("origin"), request.headers.get("host"))) {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }
  const parsed = articleSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the article fields." }, { status: 400 });
  const { id, ...fields } = parsed.data;
  const data = {
    ...fields,
    sourceLabel: fields.sourceLabel || null,
    sourceUrl: fields.sourceUrl || null,
    allowedRoles: [...new Set(fields.allowedRoles)],
  };
  if (id) {
    const existing = await prisma.knowledgeArticle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Article not found." }, { status: 404 });
    const article = await prisma.knowledgeArticle.update({ where: { id }, data });
    return NextResponse.json(article);
  }
  const article = await prisma.knowledgeArticle.create({ data: { ...data, createdById: admin.id } });
  return NextResponse.json(article, { status: 201 });
}
