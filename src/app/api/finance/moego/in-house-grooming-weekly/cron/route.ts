import { NextRequest, NextResponse } from "next/server";
import { upsertWeeklyInHouseGroomingKpis } from "@/lib/moego/in-house-grooming-weekly-report";

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
      totalPetsServiced,
    });

    return NextResponse.json({
      ok: true,
      weekStart,
      metrics: {
        totalNetSalesCents,
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
