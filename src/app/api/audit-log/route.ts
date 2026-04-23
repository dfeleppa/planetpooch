import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, getCompanyFilter, isManagerOrAbove } from "@/lib/auth-helpers";
import { Company, Prisma, Role } from "@prisma/client";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sessionUser = session.user as { role: Role; company: Company | null };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const searchParams = req.nextUrl.searchParams;
  const userId = searchParams.get("userId");
  const action = searchParams.get("action");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");

  const where: Prisma.CompletionAuditLogWhereInput = {
    // Scope to manager's company by filtering on the user's company
    ...(companyFilter.company ? { user: { company: companyFilter.company } } : {}),
  };

  if (userId) where.userId = userId;
  if (action === "COMPLETED" || action === "UNCOMPLETED") where.action = action;
  if (from || to) {
    where.timestamp = {};
    if (from) where.timestamp.gte = new Date(from);
    if (to) where.timestamp.lte = new Date(to);
  }

  const [logs, total] = await Promise.all([
    prisma.completionAuditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { id: true, name: true, email: true } },
        lesson: {
          select: {
            id: true,
            title: true,
            subsection: {
              select: {
                title: true,
                module: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
    }),
    prisma.completionAuditLog.count({ where }),
  ]);

  return NextResponse.json({
    logs,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}
