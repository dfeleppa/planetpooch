import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { UpdateAngleSchema } from "@/lib/validators/marketing";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ angleId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { angleId } = await params;
  const parsed = await validateBody(req, UpdateAngleSchema);
  if (!parsed.ok) return parsed.response;

  // Any field-level edit flips wasEdited so the eval pipeline can later
  // measure how often the strategist accepts model output unchanged.
  const fieldEdited = ["name", "emotionalRegister", "audiencePocket", "coreMessage", "visualTreatment", "differentiator"]
    .some((k) => parsed.data[k as keyof typeof parsed.data] !== undefined);

  try {
    const angle = await prisma.angle.update({
      where: { id: angleId },
      data: {
        ...parsed.data,
        ...(fieldEdited ? { wasEdited: true } : {}),
      },
    });
    return NextResponse.json(angle);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to update angle";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ angleId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { angleId } = await params;
  try {
    await prisma.angle.delete({ where: { id: angleId } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete angle";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
