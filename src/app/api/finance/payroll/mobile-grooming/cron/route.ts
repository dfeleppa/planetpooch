import { NextRequest, NextResponse } from "next/server";
import { lastCompletedPayrollWeekStart } from "@/lib/payroll";

export const maxDuration = 120;

const MS_PER_DAY = 86_400_000;
const PAYROLL_TIME_ZONE = "America/New_York";

function authError(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}

function easternHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: PAYROLL_TIME_ZONE,
      hour: "numeric",
      hourCycle: "h23",
    }).format(now)
  );
}

function dateParam(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function GET(req: NextRequest) {
  const denied = authError(req);
  if (denied) return denied;

  const now = new Date();
  // Vercel cron is UTC. The paired 05:00/06:00 UTC schedules cover 01:00 ET
  // across daylight-saving changes; only the matching invocation performs work.
  if (easternHour(now) !== 1) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not 1 AM Eastern." });
  }

  const secret = process.env.CRON_SECRET!;
  const weekStartDate = lastCompletedPayrollWeekStart("mobile-grooming", now);
  const weekEndDate = new Date(weekStartDate.getTime() + 6 * MS_PER_DAY);
  const weekStart = dateParam(weekStartDate);
  const weekEnd = dateParam(weekEndDate);
  const headers = {
    authorization: `Bearer ${secret}`,
    "content-type": "application/json",
  };

  const pullResponse = await fetch(
    new URL("/api/finance/payroll/mobile-grooming/moego", req.nextUrl.origin),
    {
      method: "POST",
      headers,
      body: JSON.stringify({ weekStart, weekEnd }),
      cache: "no-store",
    }
  );
  const pull = (await pullResponse.json()) as {
    entries?: unknown[];
    totals?: unknown;
    staffs?: unknown[];
    unmatchedEmployeeNames?: string[];
    error?: string;
  };
  if (!pullResponse.ok || !pull.entries) {
    return NextResponse.json(
      { ok: false, stage: "pull", weekStart, weekEnd, error: pull.error ?? "MoeGo pull failed." },
      { status: pullResponse.status || 500 }
    );
  }

  const saveResponse = await fetch(new URL("/api/finance/payroll", req.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "moego-mobile-grooming-cron",
      generatedAt: now.toISOString(),
      business: "mobile-grooming",
      weekStart,
      weekEnd,
      mobileEntries: pull.entries,
    }),
    cache: "no-store",
  });
  const saved = (await saveResponse.json()) as { week?: { id?: string }; error?: string };
  if (!saveResponse.ok || !saved.week) {
    return NextResponse.json(
      { ok: false, stage: "save", weekStart, weekEnd, error: saved.error ?? "Payroll save failed." },
      { status: saveResponse.status || 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    business: "mobile-grooming",
    weekStart,
    weekEnd,
    payrollWeekId: saved.week.id,
    entries: pull.entries.length,
    staffs: pull.staffs?.length ?? null,
    unmatchedEmployeeNames: pull.unmatchedEmployeeNames ?? [],
    totals: pull.totals ?? null,
  });
}
