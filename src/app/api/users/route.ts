import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, activeUserWhere } from "@/lib/auth-helpers";

export async function GET() {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Pickers (assignees, manager selects, etc.) should never offer terminated
  // users as candidates.
  const users = await prisma.user.findMany({
    where: activeUserWhere(),
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
