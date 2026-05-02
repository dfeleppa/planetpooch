import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { UpdateScriptSchema } from "@/lib/validators/marketing";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scriptId } = await params;
  const script = await prisma.script.findUnique({
    where: { id: scriptId },
    include: {
      idea: { select: { id: true, title: true } },
      createdBy: { select: { id: true, name: true } },
      hooks: { orderBy: { order: "asc" } },
    },
  });
  if (!script) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(script);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scriptId } = await params;
  const parsed = await validateBody(req, UpdateScriptSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const script = await prisma.script.update({
      where: { id: scriptId },
      data: parsed.data,
    });
    return NextResponse.json(script);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update script";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { scriptId } = await params;
  try {
    await prisma.script.delete({ where: { id: scriptId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete script";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
