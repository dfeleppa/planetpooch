import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";
import { getVisibleModuleIdsForUser } from "@/lib/module-visibility";

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q");
  if (!q || q.trim().length < 2) {
    return NextResponse.json([]);
  }

  const moduleIdFilter: { in: string[] } | undefined = isManagerOrAbove(session.user.role)
    ? undefined
    : await (async () => {
        const me = await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { jobTitle: true },
        });
        const ids = await getVisibleModuleIdsForUser(
          session.user.id,
          me?.jobTitle ?? null,
        );
        return { in: [...ids] };
      })();

  const lessons = await prisma.lesson.findMany({
    where: {
      searchText: { contains: q, mode: "insensitive" },
      ...(moduleIdFilter
        ? { subsection: { moduleId: moduleIdFilter } }
        : {}),
    },
    select: {
      id: true,
      title: true,
      searchText: true,
      subsection: {
        select: {
          title: true,
          module: { select: { id: true, title: true } },
        },
      },
    },
    take: 20,
  });

  const results = lessons.map((l) => ({
    id: l.id,
    title: l.title,
    snippet: l.searchText.substring(0, 200),
    subsectionTitle: l.subsection.title,
    moduleId: l.subsection.module.id,
    moduleTitle: l.subsection.module.title,
  }));

  return NextResponse.json(results);
}
