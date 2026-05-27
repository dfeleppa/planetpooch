import { NextRequest, NextResponse } from "next/server";
import { syncWeeklyDaycareServiceKpis } from "@/lib/moego/daycare-weekly-report";
import { MoegoApiError, MoegoConfigError } from "@/lib/moego/client";

export const maxDuration = 120;

/**
 * Weekly Daycare KPI sync. Writes the previous completed Sunday-Saturday
 * report into KpiWeeklyValue for the DAYCARE segment.
 */
export async function GET(req: NextRequest) {
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
