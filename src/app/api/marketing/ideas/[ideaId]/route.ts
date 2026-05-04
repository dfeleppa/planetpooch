import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { UpdateMarketingIdeaSchema } from "@/lib/validators/marketing";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ideaId } = await params;
  const idea = await prisma.marketingIdea.findUnique({
    where: { id: ideaId },
    include: { createdBy: { select: { id: true, name: true } } },
  });
  if (!idea) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(idea);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ideaId } = await params;
  const parsed = await validateBody(req, UpdateMarketingIdeaSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const idea = await prisma.marketingIdea.update({
      where: { id: ideaId },
      data: parsed.data,
    });
    return NextResponse.json(idea);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update idea";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ideaId } = await params;
  try {
    await prisma.marketingIdea.delete({ where: { id: ideaId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete idea";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
