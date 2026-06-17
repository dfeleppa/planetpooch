import { NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { PET_RESORT_BUSINESS_ID } from "@/lib/moego/daycare-weekly-report";
import { buildUpcomingBoardingBookingsReport } from "@/lib/moego/boarding-weekly-report";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 120;

function isAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

export async function GET() {
  const session = await getSession();
  if (!session?.user || !isAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const report = await buildUpcomingBoardingBookingsReport({
      businessId: PET_RESORT_BUSINESS_ID,
    });

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    if (err instanceof MoegoConfigError) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof MoegoApiError) {
      return NextResponse.json(
        { error: `MoeGo API: ${err.message}` },
        { status: err.status }
      );
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error("Upcoming boarding bookings query failed:", err);
    return NextResponse.json(
      { error: `Upcoming boarding bookings query failed: ${message}` },
      { status: 500 }
    );
  }
}
