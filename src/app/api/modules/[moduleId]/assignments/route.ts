import { NextRequest, NextResponse } from "next/server";
import { Company } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, hasModuleEditAccess } from "@/lib/auth-helpers";

const COMPANY_ORDER: Record<Company, number> = {
  CORPORATE: 0,
  GROOMING: 1,
  RESORT: 2,
};

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
  if (!session?.user || !hasModuleEditAccess(session.user.role, session.user.jobTitle)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { moduleId } = await params;

  const [mod, userJobTitles, orgPositions] = await Promise.all([
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
      select: { jobTitle: true, company: true },
      distinct: ["jobTitle", "company"],
      orderBy: [{ company: "asc" }, { jobTitle: "asc" }],
    }),
    prisma.orgPosition.findMany({
      select: { title: true, company: true },
      distinct: ["title", "company"],
      orderBy: [{ company: "asc" }, { title: "asc" }],
    }),
  ]);

  if (!mod) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const titleCompanies = new Map<string, Company>();
  for (const position of orgPositions) {
    if (!position.title.trim()) continue;
    titleCompanies.set(position.title, position.company ?? "CORPORATE");
  }
  for (const row of userJobTitles) {
    if (!row.jobTitle?.trim() || titleCompanies.has(row.jobTitle)) continue;
    titleCompanies.set(row.jobTitle, row.company);
  }
  const allJobTitles = Array.from(titleCompanies, ([title, company]) => ({
    title,
    company,
  })).sort((a, b) => {
    const companyDiff = COMPANY_ORDER[a.company] - COMPANY_ORDER[b.company];
    if (companyDiff !== 0) return companyDiff;
    return a.title.localeCompare(b.title);
  });

  return NextResponse.json({
    jobTitles: mod.jobTitleAssignments.map((a) => a.jobTitle),
    users: mod.userAssignments.map((a) => a.user),
    allJobTitles,
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
  if (!session?.user || !hasModuleEditAccess(session.user.role, session.user.jobTitle)) {
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
