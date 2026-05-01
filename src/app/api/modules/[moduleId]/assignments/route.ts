import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";

/**
 * GET — returns the current job-title and user assignments for a module,
 * along with the full list of distinct job titles in the system so the
 * edit page can render its checklist without a second request.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  const [mod, allJobTitles] = await Promise.all([
    prisma.module.findUnique({
      where: { id: moduleId },
      select: {
        id: true,
        jobTitleAssignments: { select: { jobTitle: true } },
        userAssignments: {
          select: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                jobTitle: true,
                company: true,
              },
            },
          },
        },
      },
    }),
    prisma.user.findMany({
      where: { jobTitle: { not: null } },
      select: { jobTitle: true },
      distinct: ["jobTitle"],
      orderBy: { jobTitle: "asc" },
    }),
  ]);

  if (!mod) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    jobTitles: mod.jobTitleAssignments.map((a) => a.jobTitle),
    users: mod.userAssignments.map((a) => a.user),
    allJobTitles: allJobTitles
      .map((r) => r.jobTitle)
      .filter((t): t is string => !!t && t.trim() !== ""),
  });
}

/**
 * PUT — replaces the module's job-title assignments with the supplied list.
 * Body: { jobTitles: string[] }
 *
 * Submitting an empty array makes the module "open" (visible to everyone)
 * unless individual user assignments still grant access.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ moduleId: string }> },
) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;
  const body = await req.json();
  const raw: unknown = body?.jobTitles;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "jobTitles must be an array" }, { status: 400 });
  }
  const jobTitles = Array.from(
    new Set(
      raw
        .filter((v): v is string => typeof v === "string")
        .map((s) => s.trim())
        .filter((s) => s !== ""),
    ),
  );

  const mod = await prisma.module.findUnique({
    where: { id: moduleId },
    select: { id: true },
  });
  if (!mod) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.$transaction([
    prisma.moduleJobTitleAssignment.deleteMany({ where: { moduleId } }),
    ...(jobTitles.length > 0
      ? [
          prisma.moduleJobTitleAssignment.createMany({
            data: jobTitles.map((jobTitle) => ({ moduleId, jobTitle })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return NextResponse.json({ jobTitles });
}
