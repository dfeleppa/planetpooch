import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const LinkRequestSchema = z.object({
  adId: z.string().min(1),
  // null clears the override (revert to auto-linker on next sync).
  scriptId: z.string().min(1).nullable(),
});

/**
 * Set or clear a manual ad-to-Script link. The override is keyed by adId,
 * so it survives ad renames and applies to every day's insight row for
 * that ad. We also write the resolved scriptId onto every existing
 * MetaAdInsight row for that ad so the UI reflects the change immediately
 * without waiting for the next sync.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (
    !session?.user ||
    !hasMarketingAccess(session.user.role, session.user.jobTitle)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = LinkRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "adId is required; scriptId must be a string or null." },
      { status: 400 }
    );
  }
  const { adId, scriptId } = parsed.data;

  if (scriptId) {
    const exists = await prisma.script.findUnique({
      where: { id: scriptId },
      select: { id: true },
    });
    if (!exists) {
      return NextResponse.json(
        { error: "Script not found." },
        { status: 404 }
      );
    }
  }

  await prisma.$transaction(async (tx) => {
    if (scriptId === null) {
      await tx.metaAdScriptOverride.deleteMany({ where: { adId } });
      // Clear the link on existing rows. The next sync will re-run the
      // slug-matcher and may re-link them automatically.
      await tx.metaAdInsight.updateMany({
        where: { adId },
        data: { scriptId: null },
      });
      return;
    }
    await tx.metaAdScriptOverride.upsert({
      where: { adId },
      create: { adId, scriptId, createdBy: session.user.id },
      update: { scriptId },
    });
    await tx.metaAdInsight.updateMany({
      where: { adId },
      data: { scriptId },
    });
  });

  return NextResponse.json({ ok: true, adId, scriptId });
}
