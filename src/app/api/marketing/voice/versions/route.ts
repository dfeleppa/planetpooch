import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasMarketingAccess } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user || !hasMarketingAccess(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const versions = await prisma.brandVoiceProfile.findMany({
    orderBy: { version: "desc" },
    select: {
      id: true,
      version: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
    take: 50,
  });

  return NextResponse.json(versions);
}
