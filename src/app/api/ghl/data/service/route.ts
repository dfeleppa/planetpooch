import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.ghlOpportunityService.findMany();
  const map: Record<string, string> = {};
  for (const r of rows) map[r.opportunityId] = r.service;

  return NextResponse.json({ services: map });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { opportunityIds, service } = body as {
    opportunityIds?: string[];
    service?: string | null;
  };

  if (!opportunityIds || opportunityIds.length === 0) {
    return NextResponse.json(
      { error: "opportunityIds is required" },
      { status: 400 },
    );
  }

  if (service && service !== "mobile" && service !== "resort") {
    return NextResponse.json(
      { error: 'service must be "mobile", "resort", or null' },
      { status: 400 },
    );
  }

  if (!service) {
    await prisma.ghlOpportunityService.deleteMany({
      where: { opportunityId: { in: opportunityIds } },
    });
    return NextResponse.json({ ok: true, service: null });
  }

  await prisma.$transaction(
    opportunityIds.map((opportunityId) =>
      prisma.ghlOpportunityService.upsert({
        where: { opportunityId },
        create: { opportunityId, service },
        update: { service },
      }),
    ),
  );

  return NextResponse.json({ ok: true, service });
}
