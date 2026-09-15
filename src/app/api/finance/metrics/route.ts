import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";
import {
  dateParamFromDate,
  WEEKLY_FINANCE_YTD_BASE,
  weekHasFinanceYtdBase,
  sumBusinessFinanceYtd,
  type FinanceYtdTotals,
} from "@/lib/finance-ytd";
import {
  fetchWeeklyPetResortRevenue,
  PET_RESORT_WEEKLY_EXPENSE_CENTS,
} from "@/lib/moego/pet-resort-weekly-finance";

export const maxDuration = 120;

function isSuperAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

function numericYear(value: string | null, fallback: number): number {
  const year = Number(value);
  return Number.isInteger(year) ? year : fallback;
}

function metricNetProfit(metric: {
  totalRevenue: number | null;
  totalProfit: number | null;
  nonPayrollExpenses: number | null;
  payrollExpenses: number | null;
}): number {
  if (metric.totalProfit !== null) return metric.totalProfit;
  if (
    metric.totalRevenue === null &&
    metric.nonPayrollExpenses === null &&
    metric.payrollExpenses === null
  ) {
    return 0;
  }
  return (
    (metric.totalRevenue ?? 0) -
    (metric.nonPayrollExpenses ?? 0) -
    (metric.payrollExpenses ?? 0)
  );
}

function replaceSelectedWeekInYtd(
  totals: FinanceYtdTotals | null,
  savedMetric: {
    totalRevenue: number | null;
    totalProfit: number | null;
    nonPayrollExpenses: number | null;
    payrollExpenses: number | null;
  } | null,
  effectiveMetric: {
    totalRevenue: number | null;
    totalProfit: number | null;
    nonPayrollExpenses: number | null;
    payrollExpenses: number | null;
  }
): FinanceYtdTotals | null {
  if (!totals) return null;
  const savedProfit = savedMetric ? metricNetProfit(savedMetric) : 0;
  return {
    totalRevenue:
      (totals.totalRevenue ?? 0) -
      (savedMetric?.totalRevenue ?? 0) +
      (effectiveMetric.totalRevenue ?? 0),
    totalProfit:
      (totals.totalProfit ?? 0) - savedProfit + metricNetProfit(effectiveMetric),
  };
}

async function calculateWeeklyFinanceYtd({
  business,
  periodEnd,
  year,
}: {
  business: string;
  periodEnd: Date;
  year: number;
}): Promise<FinanceYtdTotals | null> {
  const weekEnd = dateParamFromDate(periodEnd);
  if (business === "pet-resort-weekly" || business === "mobile-grooming-weekly") {
    const metrics = await prisma.financeMetric.findMany({
      where: { business, periodEnd: { gte: new Date(Date.UTC(year, 0, 1)), lte: periodEnd } },
      select: { totalRevenue: true, totalProfit: true, nonPayrollExpenses: true, payrollExpenses: true },
    });
    return sumBusinessFinanceYtd(metrics);
  }
  if (
    business !== WEEKLY_FINANCE_YTD_BASE.business ||
    !weekHasFinanceYtdBase(weekEnd, year)
  ) {
    return null;
  }

  if (weekEnd === WEEKLY_FINANCE_YTD_BASE.weekEnd) {
    return {
      totalRevenue: WEEKLY_FINANCE_YTD_BASE.totalRevenue,
      totalProfit: WEEKLY_FINANCE_YTD_BASE.totalProfit,
    };
  }

  const weeklyMetrics = await prisma.financeMetric.findMany({
    where: {
      business,
      periodEnd: {
        gt: new Date(`${WEEKLY_FINANCE_YTD_BASE.weekEnd}T00:00:00.000Z`),
        lte: periodEnd,
      },
    },
    select: {
      totalRevenue: true,
      totalProfit: true,
      nonPayrollExpenses: true,
      payrollExpenses: true,
    },
  });

  const totals = weeklyMetrics.reduce<FinanceYtdTotals>(
    (sum, metric) => ({
      totalRevenue: (sum.totalRevenue ?? 0) + (metric.totalRevenue ?? 0),
      totalProfit: (sum.totalProfit ?? 0) + metricNetProfit(metric),
    }),
    {
      totalRevenue: WEEKLY_FINANCE_YTD_BASE.totalRevenue,
      totalProfit: WEEKLY_FINANCE_YTD_BASE.totalProfit,
    }
  );

  return totals;
}

function ytdResponse(totals: FinanceYtdTotals, business: string) {
  return {
    totalRevenue: totals.totalRevenue,
    totalProfit: totals.totalProfit,
    nonPayrollExpenses: null,
    payrollExpenses: null,
    ...(business === WEEKLY_FINANCE_YTD_BASE.business ? { baseWeekEnd: WEEKLY_FINANCE_YTD_BASE.weekEnd } : {}),
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const business = sp.get("business");
  const from = sp.get("from");
  const to = sp.get("to");
  const year = numericYear(sp.get("year"), new Date().getUTCFullYear());

  if (!business || !from || !to) {
    return NextResponse.json({ error: "business, from, and to are required" }, { status: 400 });
  }

  const periodStart = new Date(from);
  const periodEnd = new Date(to);

  const savedMetric = await prisma.financeMetric.findUnique({
    where: {
      business_periodStart_periodEnd: {
        business,
        periodStart,
        periodEnd,
      },
    },
  });

  let metric = savedMetric;
  let moegoRevenue:
    | { source: "live-api"; orderCount: number }
    | { source: "saved"; warning: string }
    | undefined;

  if (business === "pet-resort-weekly") {
    let totalRevenue = savedMetric?.totalRevenue ?? null;
    try {
      const liveRevenue = await fetchWeeklyPetResortRevenue(
        periodStart,
        new Date(periodEnd.getTime() + 24 * 60 * 60 * 1000)
      );
      totalRevenue = liveRevenue.revenueCents;
      moegoRevenue = { source: "live-api", orderCount: liveRevenue.orderCount };
    } catch (error) {
      const warning = error instanceof Error ? error.message : "MoeGo API pull failed.";
      moegoRevenue = { source: "saved", warning };
    }

    metric = {
      ...(savedMetric ?? {
        id: "pet-resort-weekly-live",
        business,
        periodStart,
        periodEnd,
        ytdRevenue: null,
        ytdNetProfit: null,
        totalCustomers: null,
        totalAdSpend: null,
        totalConversions: null,
        metaAdSpend: null,
        metaRevenue: null,
        googleAdSpend: null,
        googleRevenue: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      totalRevenue,
      nonPayrollExpenses: PET_RESORT_WEEKLY_EXPENSE_CENTS,
      payrollExpenses: null,
      totalProfit:
        totalRevenue === null
          ? null
          : totalRevenue - PET_RESORT_WEEKLY_EXPENSE_CENTS,
    };
  }

  if (sp.get("includeYtd") !== "1") {
    return NextResponse.json({ metric, moegoRevenue });
  }

  let calculatedYtd = await calculateWeeklyFinanceYtd({
    business,
    periodEnd,
    year,
  });

  if (business === "pet-resort-weekly" && metric) {
    calculatedYtd = replaceSelectedWeekInYtd(calculatedYtd, savedMetric, metric);
  }

  return NextResponse.json({
    metric,
    moegoRevenue,
    ytd: calculatedYtd
      ? ytdResponse(calculatedYtd, business)
      : {
          totalRevenue: metric?.ytdRevenue ?? null,
          totalProfit: metric?.ytdNetProfit ?? null,
          nonPayrollExpenses: null,
          payrollExpenses: null,
        },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { business, periodStart, periodEnd, ...data } = body;

  if (!business || !periodStart || !periodEnd) {
    return NextResponse.json(
      { error: "business, periodStart, and periodEnd are required" },
      { status: 400 }
    );
  }

  const validBusinesses = [
    "all-businesses-manual",
    "all-businesses-weekly",
    "mobile-grooming-manual",
    "pet-resort-manual",
    "pet-resort-weekly",
    "mobile-grooming-weekly",
  ];
  if (!validBusinesses.includes(business)) {
    return NextResponse.json({ error: "Invalid business" }, { status: 400 });
  }

  const numericFields = [
    "totalRevenue",
    "totalProfit",
    "ytdRevenue",
    "ytdNetProfit",
    "nonPayrollExpenses",
    "payrollExpenses",
    "totalCustomers",
    "totalAdSpend",
    "totalConversions",
    "metaAdSpend",
    "metaRevenue",
    "googleAdSpend",
    "googleRevenue",
  ] as const;

  const cleanData: Record<string, number | null> = {};
  for (const field of numericFields) {
    const val = data[field];
    if (val === undefined || val === null || val === "") {
      cleanData[field] = null;
    } else {
      const num = Number(val);
      if (isNaN(num)) {
        return NextResponse.json({ error: `${field} must be a number` }, { status: 400 });
      }
      cleanData[field] = Math.round(num);
    }
  }

  if (business === "pet-resort-weekly") {
    cleanData.nonPayrollExpenses = PET_RESORT_WEEKLY_EXPENSE_CENTS;
    cleanData.payrollExpenses = null;
    cleanData.totalProfit =
      cleanData.totalRevenue === null
        ? null
        : cleanData.totalRevenue - PET_RESORT_WEEKLY_EXPENSE_CENTS;
  }

  const metric = await prisma.financeMetric.upsert({
    where: {
      business_periodStart_periodEnd: {
        business,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
      },
    },
    update: cleanData,
    create: {
      business,
      periodStart: new Date(periodStart),
      periodEnd: new Date(periodEnd),
      ...cleanData,
    },
  });

  const calculatedYtd = await calculateWeeklyFinanceYtd({
    business,
    periodEnd: new Date(periodEnd),
    year: new Date(periodEnd).getUTCFullYear(),
  });

  return NextResponse.json({
    metric,
    ...(calculatedYtd ? { ytd: ytdResponse(calculatedYtd, business) } : {}),
  });
}
