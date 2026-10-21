import { NextRequest, NextResponse } from "next/server";
import { getSession, isSuperAdmin } from "@/lib/auth-helpers";
import { mobileGroomingCloseoutPreview, type MobilePayRule } from "@/lib/mobile-grooming-closeout";
import { lastCompletedPayrollWeekStart, normalizeEmployeeName } from "@/lib/payroll";
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
  const [week, settings, rules, preparations] = await Promise.all([
    prisma.financePayrollWeek.findUnique({
      where: { business_weekStart: { business: "mobile-grooming", weekStart } },
      include: {
        mobileGroomingEntries: true,
        mobileGroomingReconciliations: true,
        mobileGroomingPayoutAdjustments: true,
        mobileGroomingVarianceReviews: true,
        mobileGroomingCloseout: true,
      },
    }),
    prisma.financeMobileGroomingDirectDeposit.findMany({
      where: { effectiveWeekStart: { lte: weekStart } },
      orderBy: { effectiveWeekStart: "desc" },
      select: { employeeName: true, amountCents: true },
    }),
    prisma.financeMobileGroomingPayRule.findMany({
      where: { effectiveWeekStart: { lte: weekStart } },
      orderBy: { effectiveWeekStart: "desc" },
      select: { employeeName: true, payKind: true, amountCents: true },
    }),
    prisma.financeMobileGroomingPayPreparation.findMany({
      where: { weekStart },
      select: { employeeName: true, prepared: true },
    }),
  ]);
  const latestSettings = new Map<string, { employeeName: string; amountCents: number }>();
  for (const setting of settings) {
    const key = setting.employeeName.toLocaleLowerCase();
    if (!latestSettings.has(key)) latestSettings.set(key, setting);
  }
  const latestRules = new Map<string, MobilePayRule>();
  for (const rule of rules) {
    const key = normalizeEmployeeName(rule.employeeName).toLocaleLowerCase();
    if (!latestRules.has(key) && (rule.payKind === "fixed" || rule.payKind === "additive")) {
      latestRules.set(key, { employeeName: rule.employeeName, payKind: rule.payKind, amountCents: rule.amountCents });
    }
  }
  const preview = mobileGroomingCloseoutPreview(
    week?.mobileGroomingEntries ?? [],
    week?.mobileGroomingReconciliations ?? [],
    Array.from(latestSettings.values()),
    week?.mobileGroomingPayoutAdjustments ?? [],
    week?.mobileGroomingVarianceReviews ?? [],
    Array.from(latestRules.values())
  );
  const preparedByName = new Map(preparations.map((row) => [normalizeEmployeeName(row.employeeName).toLocaleLowerCase(), row.prepared]));
  return { week, preview: {
    ...preview,
    payouts: preview.payouts.map((payout) => ({
      ...payout,
      payPrepared: preparedByName.get(normalizeEmployeeName(payout.employeeName).toLocaleLowerCase()) ?? false,
    })),
  } };
}

function serializeCloseout(closeout: NonNullable<NonNullable<Awaited<ReturnType<typeof getWeek>>>["week"]>["mobileGroomingCloseout"]) {
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
  const closeout = serializeCloseout(result.week?.mobileGroomingCloseout ?? null);
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
  if (!result.week) return NextResponse.json({ error: "No saved mobile grooming payroll exists for this week." }, { status: 404 });
  const { preview, week } = result;
  if (body.sourceFingerprint !== preview.sourceFingerprint) {
    return NextResponse.json({ error: "Payroll or reconciliation changed. Reload payouts before closing the week." }, { status: 409 });
  }
  if (
    preview.workedDays === 0 || preview.missingDays.length > 0 || preview.staleDays.length > 0 ||
    preview.missingDepositSettings.length > 0 || preview.negativeCashPayouts.length > 0 ||
    preview.pendingVarianceReviews.length > 0 ||
    preview.expectedDepositCents < 0
  ) {
    return NextResponse.json({ error: "Complete daily reconciliation, review every employee's variance, and set valid direct deposits before closeout." }, { status: 409 });
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

export async function PUT(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const weekStart = dateParam(body.weekStart);
  const employeeName = normalizeEmployeeName(typeof body.employeeName === "string" ? body.employeeName : "");
  if (!weekStart || !employeeName || employeeName.length > 200 || typeof body.applyToCashPayout !== "boolean") {
    return NextResponse.json({ error: "A valid week, employee, and pay decision are required." }, { status: 400 });
  }
  const result = await getWeek(weekStart);
  if (!result.week) return NextResponse.json({ error: "No saved payroll exists for this week." }, { status: 404 });
  const payout = result.preview.payouts.find((item) => item.employeeName.toLocaleLowerCase() === employeeName.toLocaleLowerCase());
  if (!payout) return NextResponse.json({ error: "Employee was not found in this week." }, { status: 404 });
  const employeeDays = result.week.mobileGroomingEntries
    .filter((entry) => normalizeEmployeeName(entry.employeeName).toLocaleLowerCase() === employeeName.toLocaleLowerCase());
  const dates = new Set(employeeDays.map((entry) => entry.serviceDate.toISOString().slice(0, 10)));
  if (result.preview.missingDays.some((day) => day.startsWith(`${payout.employeeName} — `)) ||
      result.preview.staleDays.some((day) => day.startsWith(`${payout.employeeName} — `)) || dates.size === 0) {
    return NextResponse.json({ error: "Complete and refresh this employee's daily reconciliation first." }, { status: 409 });
  }
  await prisma.financeMobileGroomingVarianceReview.upsert({
    where: { payrollWeekId_employeeName: { payrollWeekId: result.week.id, employeeName: payout.employeeName } },
    create: { payrollWeekId: result.week.id, employeeName: payout.employeeName, varianceCents: payout.varianceCents, sourceFingerprint: payout.reconciliationFingerprint, applyToCashPayout: body.applyToCashPayout },
    update: { varianceCents: payout.varianceCents, sourceFingerprint: payout.reconciliationFingerprint, applyToCashPayout: body.applyToCashPayout, reviewedAt: new Date() },
  });
  const updated = await getWeek(weekStart);
  if (!updated.week) return NextResponse.json({ error: "Payroll week disappeared." }, { status: 409 });
  const closeout = serializeCloseout(updated.week.mobileGroomingCloseout);
  return NextResponse.json({
    preview: updated.preview, closeout,
    closeoutCurrent: Boolean(closeout && closeout.sourceFingerprint === updated.preview.sourceFingerprint),
    weekCompleted: weekStart <= lastCompletedEasternWeekStart(),
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await authorized())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const weekStart = dateParam(body.weekStart);
  const employeeName = normalizeEmployeeName(typeof body.employeeName === "string" ? body.employeeName : "");
  if (!weekStart || !employeeName || employeeName.length > 200 || typeof body.prepared !== "boolean") {
    return NextResponse.json({ error: "A valid week, employee, and preparation status are required." }, { status: 400 });
  }
  const result = await getWeek(weekStart);
  const payout = result.preview.payouts.find((item) =>
    normalizeEmployeeName(item.employeeName).toLocaleLowerCase() === employeeName.toLocaleLowerCase()
  );
  if (!payout) return NextResponse.json({ error: "Employee was not found in this week." }, { status: 404 });
  const prepared = body.prepared;
  await prisma.financeMobileGroomingPayPreparation.upsert({
    where: { weekStart_employeeName: { weekStart, employeeName: payout.employeeName } },
    create: { weekStart, employeeName: payout.employeeName, prepared },
    update: { prepared },
  });
  return NextResponse.json({ employeeName: payout.employeeName, prepared });
}
