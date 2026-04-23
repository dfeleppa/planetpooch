import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { validateBody } from "@/lib/validate";
import { CreateTemplateSchema } from "@/lib/validators/onboarding";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const templates = await prisma.onboardingTemplate.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { tasks: true } },
      createdBy: { select: { name: true } },
    },
  });

  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await validateBody(req, CreateTemplateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const template = await prisma.onboardingTemplate.create({
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        isActive: parsed.data.isActive,
        createdById: (session.user as { id: string }).id,
      },
    });
    return NextResponse.json(template, { status: 201 });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
