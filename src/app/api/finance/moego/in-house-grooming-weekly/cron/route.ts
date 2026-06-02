import { NextRequest, NextResponse } from "next/server";
import {
  syncWeeklyInHouseGroomingKpis,
  upsertWeeklyInHouseGroomingKpis,
} from "@/lib/moego/in-house-grooming-weekly-report";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 120;

function requireCronAuth(req: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured." },
      { status: 503 }
    );
  }

  if (req.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * Weekly in-house grooming KPI sync. Writes the previous completed
 * Sunday-Saturday report into KpiWeeklyValue for IN_HOUSE_GROOMING.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const report = await syncWeeklyInHouseGroomingKpis();
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
    console.error("In-house grooming weekly KPI sync failed:", err);
    return NextResponse.json(
      { error: `In-house grooming weekly KPI sync failed: ${message}` },
      { status: 500 }
    );
  }
}

function readFiniteNumber(
  body: Record<string, unknown>,
  key: string
): number | null {
  const value = body[key];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return value;
}

export async function POST(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const weekStart = body.weekStart;
  const totalNetSalesCents = readFiniteNumber(body, "totalNetSalesCents");
  const upsellsCents = readFiniteNumber(body, "upsellsCents") ?? 0;
  const totalPetsServiced = readFiniteNumber(body, "totalPetsServiced");

  if (
    typeof weekStart !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ||
    totalNetSalesCents === null ||
    totalPetsServiced === null
  ) {
    return NextResponse.json(
      {
        error:
          "weekStart, totalNetSalesCents, and totalPetsServiced are required.",
      },
      { status: 400 }
    );
  }

  try {
    await upsertWeeklyInHouseGroomingKpis({
      weekStart,
      totalNetSalesCents,
      upsellsCents,
      totalPetsServiced,
    });

    return NextResponse.json({
      ok: true,
      weekStart,
      metrics: {
        totalNetSalesCents,
        upsellsCents,
        totalPetsServiced,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Manual in-house grooming weekly KPI upsert failed:", err);
    return NextResponse.json(
      { error: `Manual in-house grooming weekly KPI upsert failed: ${message}` },
      { status: 500 }
    );
  }
}
