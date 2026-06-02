import { NextRequest, NextResponse } from "next/server";
import { Role } from "@prisma/client";
import { getSession } from "@/lib/auth-helpers";
import { isValidWeekParam } from "@/lib/week";
import {
  PET_RESORT_BUSINESS_ID,
  syncWeeklyDaycareServiceKpis,
} from "@/lib/moego/daycare-weekly-report";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 120;

function isAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const weekStart = body.weekStart;
  if (typeof weekStart !== "string" || !isValidWeekParam(weekStart)) {
    return NextResponse.json(
      { error: "weekStart must be a Sunday date in YYYY-MM-DD format." },
      { status: 400 }
    );
  }

  try {
    const report = await syncWeeklyDaycareServiceKpis({
      weekStart,
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
    console.error("Daycare MoeGo KPI import failed:", err);
    return NextResponse.json(
      { error: `Daycare MoeGo KPI import failed: ${message}` },
      { status: 500 }
    );
  }
}
