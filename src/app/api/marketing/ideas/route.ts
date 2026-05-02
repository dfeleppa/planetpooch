import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import {
  CreateMarketingIdeaSchema,
  IdeaStatusSchema,
  ServiceLineSchema,
} from "@/lib/validators/marketing";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const serviceLineParam = searchParams.get("serviceLine");

  const statusFilter = statusParam ? IdeaStatusSchema.safeParse(statusParam) : null;
  const serviceLineFilter = serviceLineParam
    ? ServiceLineSchema.safeParse(serviceLineParam)
    : null;

  const ideas = await prisma.marketingIdea.findMany({
    where: {
      ...(statusFilter?.success ? { status: statusFilter.data } : {}),
      ...(serviceLineFilter?.success
        ? { serviceLine: serviceLineFilter.data }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(ideas);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await validateBody(req, CreateMarketingIdeaSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const idea = await prisma.marketingIdea.create({
      data: {
        title: parsed.data.title,
        insight: parsed.data.insight,
        audience: parsed.data.audience,
        serviceLine: parsed.data.serviceLine,
        tags: parsed.data.tags,
        notes: parsed.data.notes,
        createdById: (session.user as { id: string }).id,
      },
    });
    return NextResponse.json(idea, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create idea";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
