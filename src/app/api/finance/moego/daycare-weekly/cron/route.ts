import { NextRequest, NextResponse } from "next/server";
import {
  syncWeeklyDaycareServiceKpis,
  upsertWeeklyDaycareKpis,
} from "@/lib/moego/daycare-weekly-report";
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

/**
 * Weekly Daycare KPI sync. Writes the previous completed Sunday-Saturday
 * report into KpiWeeklyValue for the DAYCARE segment.
 */
export async function GET(req: NextRequest) {
  const authError = requireCronAuth(req);
  if (authError) return authError;

  try {
    const report = await syncWeeklyDaycareServiceKpis();
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
    console.error("Daycare weekly KPI sync failed:", err);
    return NextResponse.json(
      { error: `Daycare weekly KPI sync failed: ${message}` },
      { status: 500 }
    );
  }
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
  const fullDayDaycareAppointments =
    readFiniteNumber(body, "fullDayDaycareAppointments") ??
    readFiniteNumber(body, "totalNonTrainingAppointments");
  const uniqueClients = readFiniteNumber(body, "uniqueClients");
  const halfDayDaycareAppointments =
    readFiniteNumber(body, "halfDayDaycareAppointments") ?? 0;
  const fullDayEnrichmentActivityAppointments =
    readFiniteNumber(body, "fullDayEnrichmentActivityAppointments") ?? 0;
  const halfDayEnrichmentActivityAppointments =
    readFiniteNumber(body, "halfDayEnrichmentActivityAppointments") ?? 0;
  const evaluations = readFiniteNumber(body, "evaluations") ?? 0;
  const daycareVisitAppointments =
    (fullDayDaycareAppointments ?? 0) +
    halfDayDaycareAppointments +
    fullDayEnrichmentActivityAppointments +
    halfDayEnrichmentActivityAppointments;
  const totalDaycareAppointments =
    readFiniteNumber(body, "totalDaycareAppointments") ??
    (fullDayDaycareAppointments !== null
      ? daycareVisitAppointments + evaluations
      : null);
  const averageDailyOccupancy =
    readFiniteNumber(body, "averageDailyOccupancy") ??
    (fullDayDaycareAppointments !== null
      ? daycareVisitAppointments / 6
      : null);
  const totalNetSalesCents = readFiniteNumber(body, "totalNetSalesCents");
  const averageVisitsPerClient =
    readFiniteNumber(body, "averageVisitsPerClient") ??
    (fullDayDaycareAppointments !== null && uniqueClients
      ? daycareVisitAppointments / uniqueClients
      : null);

  if (
    typeof weekStart !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ||
    totalDaycareAppointments === null ||
    fullDayDaycareAppointments === null ||
    averageDailyOccupancy === null ||
    uniqueClients === null ||
    averageVisitsPerClient === null ||
    totalNetSalesCents === null
  ) {
    return NextResponse.json(
      {
        error:
          "weekStart, fullDayDaycareAppointments, uniqueClients, averageVisitsPerClient, and totalNetSalesCents are required.",
      },
      { status: 400 }
    );
  }

  try {
    await upsertWeeklyDaycareKpis({
      weekStart,
      totalDaycareAppointments,
      totalNonTrainingAppointments: fullDayDaycareAppointments,
      fullDayDaycareAppointments,
      halfDayDaycareAppointments,
      fullDayEnrichmentActivityAppointments,
      halfDayEnrichmentActivityAppointments,
      averageDailyOccupancy,
      evaluations,
      uniqueClients,
      averageVisitsPerClient,
      totalNetSalesCents,
    });

    return NextResponse.json({
      ok: true,
      weekStart,
      metrics: {
        totalDaycareAppointments,
        totalNonTrainingAppointments: fullDayDaycareAppointments,
        fullDayDaycareAppointments,
        halfDayDaycareAppointments,
        fullDayEnrichmentActivityAppointments,
        halfDayEnrichmentActivityAppointments,
        averageDailyOccupancy,
        evaluations,
        uniqueClients,
        averageVisitsPerClient,
        totalNetSalesCents,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Manual daycare weekly KPI upsert failed:", err);
    return NextResponse.json(
      { error: `Manual daycare weekly KPI upsert failed: ${message}` },
      { status: 500 }
    );
  }
}
