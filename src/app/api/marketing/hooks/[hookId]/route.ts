import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { UpdateHookSchema } from "@/lib/validators/marketing";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ hookId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { hookId } = await params;
  const parsed = await validateBody(req, UpdateHookSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const hook = await prisma.hook.update({
      where: { id: hookId },
      data: parsed.data,
    });
    return NextResponse.json(hook);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to update hook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ hookId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { hookId } = await params;
  try {
    await prisma.hook.delete({ where: { id: hookId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to delete hook";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
