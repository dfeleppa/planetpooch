import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { Company, Role } from "@prisma/client";

export async function GET() {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);
  const positionWhere = companyFilter.company
    ? { OR: [{ company: companyFilter.company }, { company: null }] }
    : {};

  const [userRows, positionRows] = await Promise.all([
    prisma.user.findMany({
      where: { ...companyFilter, jobTitle: { not: null } },
      select: { jobTitle: true },
      distinct: ["jobTitle"],
      orderBy: { jobTitle: "asc" },
    }),
    prisma.orgPosition.findMany({
      where: positionWhere,
      select: { title: true },
      distinct: ["title"],
      orderBy: { title: "asc" },
    }),
  ]);

  const titles = [...userRows.map((r) => r.jobTitle), ...positionRows.map((r) => r.title)]
    .filter((t): t is string => !!t && t.trim() !== "");

  return NextResponse.json(Array.from(new Set(titles)).sort((a, b) => a.localeCompare(b)));
}
