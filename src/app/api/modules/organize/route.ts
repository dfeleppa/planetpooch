import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, hasModuleEditAccess } from "@/lib/auth-helpers";

type OrganizationBody = {
  moduleIds?: string[];
  subsectionsByModule?: Record<string, string[]>;
  lessonsBySubsection?: Record<string, string[]>;
};

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !hasModuleEditAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as OrganizationBody;
  const updates = [];

  if (body.moduleIds !== undefined) {
    if (!Array.isArray(body.moduleIds)) {
      return NextResponse.json({ error: "moduleIds must be an array" }, { status: 400 });
    }

    updates.push(
      ...body.moduleIds.map((id, index) =>
        prisma.module.update({ where: { id }, data: { order: index } }),
      ),
    );
  }

  if (body.subsectionsByModule !== undefined) {
    if (!isStringArrayRecord(body.subsectionsByModule)) {
      return NextResponse.json(
        { error: "subsectionsByModule must map module ids to subsection id arrays" },
        { status: 400 },
      );
    }

    for (const [moduleId, subsectionIds] of Object.entries(body.subsectionsByModule)) {
      updates.push(
        ...subsectionIds.map((id, index) =>
          prisma.subsection.update({
            where: { id },
            data: { moduleId, order: index },
          }),
        ),
      );
    }
  }

  if (body.lessonsBySubsection !== undefined) {
    if (!isStringArrayRecord(body.lessonsBySubsection)) {
      return NextResponse.json(
        { error: "lessonsBySubsection must map subsection ids to lesson id arrays" },
        { status: 400 },
      );
    }

    for (const [subsectionId, lessonIds] of Object.entries(body.lessonsBySubsection)) {
      updates.push(
        ...lessonIds.map((id, index) =>
          prisma.lesson.update({
            where: { id },
            data: { subsectionId, order: index },
          }),
        ),
      );
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No organization changes provided" }, { status: 400 });
  }

  await prisma.$transaction(updates);

  return NextResponse.json({ success: true });
}

function isStringArrayRecord(value: unknown): value is Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === "string"),
  );
}
