import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { mobileGroomingCloseoutPreview } from "@/lib/mobile-grooming-closeout";
import { lastCompletedPayrollWeekStart } from "@/lib/payroll";
import { prisma } from "@/lib/prisma";

async function authorized() {
  const session = await getSession();
  return Boolean(session?.user && isSuperAdmin((session.user as { role?: string }).role));
}

function dateParam(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value || date.getUTCDay() !== 6
    ? null : date;
}

function lastCompletedEasternWeekStart() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const easternToday = new Date(value("year"), value("month") - 1, value("day"));
  return lastCompletedPayrollWeekStart("mobile-grooming", easternToday);
}

async function getWeek(weekStart: Date) {
  const [week, settings] = await Promise.all([
    prisma.financePayrollWeek.findUnique({
      where: { business_weekStart: { business: "mobile-grooming", weekStart } },
      include: {
        mobileGroomingEntries: true,
        mobileGroomingReconciliations: true,
        mobileGroomingPayoutAdjustments: true,
        mobileGroomingCloseout: true,
      },
    }),
    prisma.financeMobileGroomingDirectDeposit.findMany({
      where: { effectiveWeekStart: { lte: weekStart } },
      orderBy: { effectiveWeekStart: "desc" },
      select: { employeeName: true, amountCents: true },
    }),
  ]);
  if (!week) return null;
  const latestSettings = new Map<string, { employeeName: string; amountCents: number }>();
  for (const setting of settings) {
    const key = setting.employeeName.toLocaleLowerCase();
    if (!latestSettings.has(key)) latestSettings.set(key, setting);
  }
  const preview = mobileGroomingCloseoutPreview(
    week.mobileGroomingEntries,
    week.mobileGroomingReconciliations,
    Array.from(latestSettings.values()),
    week.mobileGroomingPayoutAdjustments
  );
  return { week, preview };
}

function serializeCloseout(closeout: NonNullable<Awaited<ReturnType<typeof getWeek>>>["week"]["mobileGroomingCloseout"]) {
  if (!closeout) return null;
  return {
    countedCashCents: closeout.countedCashCents,
    cashPayoutCents: closeout.cashPayoutCents,
    expectedDepositCents: closeout.expectedDepositCents,
    finalDepositCents: closeout.finalDepositCents,
    varianceCents: closeout.varianceCents,
    note: closeout.note,
    closedAt: closeout.closedAt.toISOString(),
    sourceFingerprint: closeout.sourceFingerprint,
  };
}

export async function GET(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const weekStart = dateParam(req.nextUrl.searchParams.get("weekStart"));
  if (!weekStart) return NextResponse.json({ error: "A Saturday weekStart is required." }, { status: 400 });
  const result = await getWeek(weekStart);
  if (!result) return NextResponse.json({
    preview: mobileGroomingCloseoutPreview([], [], []), closeout: null,
    closeoutCurrent: false, weekCompleted: weekStart <= lastCompletedEasternWeekStart(),
  });
  const closeout = serializeCloseout(result.week.mobileGroomingCloseout);
  return NextResponse.json({
    preview: result.preview,
    closeout,
    closeoutCurrent: Boolean(closeout && closeout.sourceFingerprint === result.preview.sourceFingerprint),
    weekCompleted: weekStart <= lastCompletedEasternWeekStart(),
  });
}

export async function POST(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const weekStart = dateParam(body.weekStart);
  const finalDepositCents = body.finalDepositCents;
  const note = body.note === undefined ? "" : body.note;
  if (
    !weekStart || typeof finalDepositCents !== "number" || !Number.isSafeInteger(finalDepositCents) ||
    finalDepositCents < 0 || finalDepositCents > 2_147_483_647 ||
    typeof note !== "string" || note.trim().length > 1000
  ) return NextResponse.json({ error: "A valid week and final deposit amount are required." }, { status: 400 });
  if (weekStart > lastCompletedEasternWeekStart()) {
    return NextResponse.json({ error: "The payroll week must be complete before closeout." }, { status: 400 });
  }
  const result = await getWeek(weekStart);
  if (!result) return NextResponse.json({ error: "No saved mobile grooming payroll exists for this week." }, { status: 404 });
  const { preview, week } = result;
  if (body.sourceFingerprint !== preview.sourceFingerprint) {
    return NextResponse.json({ error: "Payroll or reconciliation changed. Reload payouts before closing the week." }, { status: 409 });
  }
  if (
    preview.workedDays === 0 || preview.missingDays.length > 0 || preview.staleDays.length > 0 ||
    preview.missingDepositSettings.length > 0 || preview.negativeCashPayouts.length > 0 ||
    preview.expectedDepositCents < 0
  ) {
    return NextResponse.json({ error: "Complete daily reconciliation and set valid direct deposits for every groomer before closeout." }, { status: 409 });
  }
  const varianceCents = finalDepositCents - preview.expectedDepositCents;
  if (varianceCents !== 0 && !note.trim()) {
    return NextResponse.json({ error: "Explain the final deposit difference before closing the week." }, { status: 400 });
  }
  const data = {
    countedCashCents: preview.countedCashCents,
    cashPayoutCents: preview.cashPayoutCents,
    expectedDepositCents: preview.expectedDepositCents,
    finalDepositCents,
    varianceCents,
    note: note.trim(),
    sourceFingerprint: preview.sourceFingerprint,
    payoutSnapshot: preview.payouts,
    closedAt: new Date(),
  };
  const closeout = await prisma.financeMobileGroomingWeeklyCloseout.upsert({
    where: { payrollWeekId: week.id },
    create: { payrollWeekId: week.id, ...data },
    update: data,
  });
  return NextResponse.json({ closeout: serializeCloseout(closeout), preview, closeoutCurrent: true, weekCompleted: true });
}
