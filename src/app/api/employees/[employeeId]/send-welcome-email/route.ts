import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import {
  getSession,
  getCompanyFilter,
  isManagerOrAbove,
} from "@/lib/auth-helpers";
import { generateTempPassword } from "@/lib/onboarding";
import { isEmailEnabled, sendWelcomeEmail } from "@/lib/email";
import { Company, Role } from "@prisma/client";

/**
 * POST — generate a fresh temp password for the employee and email it to them
 * along with a link to /login. Used both for the initial welcome and for
 * resends; each call invalidates any previously issued temp password.
 *
 * Refuses if the employee is terminated, has a placeholder email, or if the
 * email service isn't configured — the admin needs to know which knob to turn.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  const session = await getSession();
  if (!session?.user || !isManagerOrAbove(session.user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!isEmailEnabled()) {
    return NextResponse.json(
      {
        error:
          "Email is not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and NEXT_PUBLIC_APP_URL.",
      },
      { status: 500 }
    );
  }

  const { employeeId } = await params;
  const sessionUser = session.user as { role: Role; company: Company };
  const companyFilter = getCompanyFilter(sessionUser.role, sessionUser.company);

  const target = await prisma.user.findUnique({
    where: { id: employeeId },
    select: {
      id: true,
      email: true,
      firstName: true,
      company: true,
      terminatedAt: true,
    },
  });

  if (!target) {
    return NextResponse.json({ error: "Employee not found" }, { status: 404 });
  }
  if (companyFilter.company && target.company !== companyFilter.company) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (target.terminatedAt) {
    return NextResponse.json(
      { error: "Cannot send welcome email to a terminated employee" },
      { status: 400 }
    );
  }
  if (target.email.endsWith("@placeholder.local")) {
    return NextResponse.json(
      { error: "This employee has no real email address on file" },
      { status: 400 }
    );
  }

  const tempPassword = generateTempPassword();
  const passwordHash = await bcrypt.hash(tempPassword, 10);

  // Persist the new hash BEFORE sending so a successful email can never refer
  // to a password that isn't valid. If the email send fails we still rolled
  // the password — the admin clicks again to retry, which generates another.
  await prisma.user.update({
    where: { id: target.id },
    data: { passwordHash, mustChangePassword: true },
  });

  try {
    await sendWelcomeEmail(
      { email: target.email, firstName: target.firstName },
      tempPassword
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to send email";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true, sentTo: target.email });
}
