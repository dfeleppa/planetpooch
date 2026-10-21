import { NextRequest, NextResponse } from "next/server";
import { mobileGroomingCronWeek } from "@/lib/mobile-grooming-payroll-cron";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ offset: string }> }
) {
  const denied = authError(req);
  if (denied) return denied;

  const { offset: offsetText } = await params;
  if (!/^[0-3]$/.test(offsetText)) {
    return NextResponse.json({ error: "Invalid week offset." }, { status: 400 });
  }
  const offset = Number(offsetText);
  const week = mobileGroomingCronWeek(new Date(), offset);
  if (!week) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Outside Sunday 6 AM Eastern." });
  }

  const headers = {
    authorization: `Bearer ${process.env.CRON_SECRET}`,
    "content-type": "application/json",
  };
  const pullResponse = await fetch(
    new URL("/api/finance/payroll/mobile-grooming/moego", req.nextUrl.origin),
    {
      method: "POST",
      headers,
      body: JSON.stringify(week),
      cache: "no-store",
    }
  );
  const pull = (await pullResponse.json()) as {
    entries?: unknown[];
    totals?: unknown;
    staffs?: Array<{ name: string }>;
    unmatchedEmployeeNames?: string[];
    error?: string;
  };
  if (!pullResponse.ok || !pull.entries) {
    return NextResponse.json(
      { ok: false, stage: "pull", offset, ...week, error: pull.error ?? "MoeGo pull failed." },
      { status: pullResponse.status || 500 }
    );
  }
  // An empty import can be a transient MoeGo failure; never clear saved rows with it.
  if (pull.entries.length === 0) {
    return NextResponse.json(
      { ok: false, stage: "pull", offset, ...week, error: "MoeGo returned no appointments; saved payroll was preserved." },
      { status: 409 }
    );
  }

  // A former groomer can disappear from today's MoeGo staff list while their
  // historical appointments remain payable. Never turn that into a pay cut.
  const savedWeek = await prisma.financePayrollWeek.findUnique({
    where: { business_weekStart: { business: "mobile-grooming", weekStart: new Date(`${week.weekStart}T00:00:00.000Z`) } },
    select: { mobileGroomingEntries: { select: { employeeName: true } } },
  });
  const pulledNames = new Set((pull.staffs ?? []).map((staff) => staff.name.trim().toLocaleLowerCase()));
  const missingStaff = [...new Set((savedWeek?.mobileGroomingEntries ?? []).map((entry) => entry.employeeName))]
    .filter((name) => !pulledNames.has(name.trim().toLocaleLowerCase()));
  if (missingStaff.length > 0) {
    return NextResponse.json(
      { ok: false, stage: "staff-check", offset, ...week, error: "Saved groomers are missing from the MoeGo pull; payroll was preserved.", missingStaff },
      { status: 409 }
    );
  }

  const saveResponse = await fetch(new URL("/api/finance/payroll", req.nextUrl.origin), {
    method: "POST",
    headers,
    body: JSON.stringify({
      source: "moego-mobile-grooming-cron",
      generatedAt: new Date().toISOString(),
      business: "mobile-grooming",
      ...week,
      mobileEntries: pull.entries,
    }),
    cache: "no-store",
  });
  const saved = (await saveResponse.json()) as { week?: { id?: string }; error?: string };
  if (!saveResponse.ok || !saved.week) {
    return NextResponse.json(
      { ok: false, stage: "save", offset, ...week, error: saved.error ?? "Payroll save failed." },
      { status: saveResponse.status || 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    business: "mobile-grooming",
    offset,
    ...week,
    payrollWeekId: saved.week.id,
    entries: pull.entries.length,
    staffs: pull.staffs?.length ?? null,
    unmatchedEmployeeNames: pull.unmatchedEmployeeNames ?? [],
    totals: pull.totals ?? null,
  });
}
