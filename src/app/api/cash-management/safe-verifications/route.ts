import { NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { SAFE_CENTS } from "@/lib/cash-management";
import { prisma } from "@/lib/prisma";

async function authorizedUser() {
  const session = await getSession();
  const user = session?.user as { id?: string; name?: string | null; email?: string | null; role?: string } | undefined;
  return user?.id && isSuperAdmin(user.role) ? user : null;
}

export async function GET() {
  if (!(await authorizedUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entries = await prisma.safeBalanceVerification.findMany({
    orderBy: [{ verifiedAt: "desc" }, { id: "desc" }], take: 50,
  });
  return NextResponse.json({ entries });
}

export async function POST(request: Request) {
  const user = await authorizedUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null);
  const countedCents = body?.countedCents;
  const note = body?.note;
  if (
    typeof countedCents !== "number" || !Number.isSafeInteger(countedCents) ||
    countedCents < 0 || countedCents > 2_147_483_647 ||
    typeof note !== "string" || note.length > 2000
  ) return NextResponse.json({ error: "Enter a valid counted balance and a note under 2,000 characters." }, { status: 400 });

  const entry = await prisma.safeBalanceVerification.create({ data: {
    expectedCents: SAFE_CENTS, countedCents, varianceCents: countedCents - SAFE_CENTS,
    note: note.trim(), verifiedById: user.id!, verifiedByName: user.name ?? user.email ?? "Unknown",
  } });
  return NextResponse.json({ entry }, { status: 201 });
}
