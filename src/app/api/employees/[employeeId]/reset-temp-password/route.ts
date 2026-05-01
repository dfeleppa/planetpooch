import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { generateTempPassword } from "@/lib/onboarding";

/**
 * POST — generate a fresh temp password for the employee and return the
 * plaintext to the caller. Super admin only — managers must use the email
 * flow which never reveals the plaintext to a human-readable response.
 *
 * This is a stopgap for the period before transactional email is configured,
 * and a recovery path if an admin loses an unsent password. Each call
 * invalidates any previously issued temp password.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { employeeId } = await params;

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, terminatedAt: true },
  });

  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (target.terminatedAt) {
    return NextResponse.json(
      { error: "Cannot reset password for a terminated employee" },
      { status: 400 }
    );
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, mustChangePassword: true },
  });

  return NextResponse.json({ tempPassword });
}
