import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isManagerOrAbove } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await prisma.user.findMany({
    where: { jobTitle: { not: null } },
    select: { jobTitle: true },
    distinct: ["jobTitle"],
    orderBy: { jobTitle: "asc" },
  });

  const titles = rows
    .map((r) => r.jobTitle)
    .filter((t): t is string => !!t && t.trim() !== "");

  return NextResponse.json(titles);
}
