import { NextRequest, NextResponse } from "next/server";
import { Company } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSession, hasModuleEditAccess } from "@/lib/auth-helpers";

const COMPANY_ORDER: Record<Company, number> = {
  CORPORATE: 0,
  GROOMING: 1,
  RESORT: 2,
};

const COMPANIES = new Set<Company>(["CORPORATE", "GROOMING", "RESORT"]);

interface VisibilityRole {
  title: string;
  company: Company;
}

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
        jobTitleAssignments: { select: { jobTitle: true, company: true } },
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

  const titleCompanies = new Map<string, VisibilityRole>();
  for (const position of orgPositions) {
    if (!position.title.trim()) continue;
    const company = position.company ?? "CORPORATE";
    titleCompanies.set(`${position.title}|${company}`, {
      title: position.title,
      company,
    });
  }
  for (const row of userJobTitles) {
    if (!row.jobTitle?.trim()) continue;
    const key = `${row.jobTitle}|${row.company}`;
    if (titleCompanies.has(key)) continue;
    titleCompanies.set(key, {
      title: row.jobTitle,
      company: row.company,
    });
  }
  const allJobTitles = Array.from(titleCompanies.values()).sort((a, b) => {
    const companyDiff = COMPANY_ORDER[a.company] - COMPANY_ORDER[b.company];
    if (companyDiff !== 0) return companyDiff;
    return a.title.localeCompare(b.title);
  });

  const roles = mod.jobTitleAssignments.flatMap((assignment) => {
    if (assignment.company) {
      return [{ title: assignment.jobTitle, company: assignment.company }];
    }

    const matchingRoles = allJobTitles.filter(
      (option) => option.title === assignment.jobTitle,
    );
    return matchingRoles.length > 0
      ? matchingRoles
      : [{ title: assignment.jobTitle, company: "CORPORATE" as Company }];
  });

  return NextResponse.json({
    roles,
    jobTitles: mod.jobTitleAssignments.map((a) => a.jobTitle),
    users: mod.userAssignments.map((a) => a.user),
    allJobTitles,
  });
}

/**
 * PUT — replaces the module's job-title assignments with the supplied list.
 * Body: { roles: { title: string, company: Company }[] }
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
  const rawRoles: unknown = body?.roles;
  const rawLegacyJobTitles: unknown = body?.jobTitles;

  if (!Array.isArray(rawRoles) && !Array.isArray(rawLegacyJobTitles)) {
    return NextResponse.json(
      { error: "roles must be an array" },
      { status: 400 },
    );
  }

  const roles: VisibilityRole[] = Array.from(
    new Map(
      (Array.isArray(rawRoles)
        ? rawRoles.flatMap((value): VisibilityRole[] => {
            if (!value || typeof value !== "object") return [];
            const role = value as { title?: unknown; company?: unknown };
            if (typeof role.title !== "string") return [];
            if (typeof role.company !== "string" || !COMPANIES.has(role.company as Company)) {
              return [];
            }
            const title = role.title.trim();
            if (!title) return [];
            return [{ title, company: role.company as Company }];
          })
        : (rawLegacyJobTitles as unknown[])
            .filter((value): value is string => typeof value === "string")
            .map((title) => ({ title: title.trim(), company: "CORPORATE" as Company }))
            .filter((role) => role.title !== "")
      ).map((role) => [`${role.title}|${role.company}`, role]),
    ).values(),
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
    ...(roles.length > 0
      ? [
          prisma.moduleJobTitleAssignment.createMany({
            data: roles.map((role) => ({
              moduleId,
              jobTitle: role.title,
              company: role.company,
            })),
            skipDuplicates: true,
          }),
        ]
      : []),
  ]);

  return NextResponse.json({
    roles,
    jobTitles: roles.map((role) => role.title),
  });
}
