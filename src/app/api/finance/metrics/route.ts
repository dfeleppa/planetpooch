import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";
import {
  dateParamFromDate,
  WEEKLY_FINANCE_YTD_BASE,
  weekHasFinanceYtdBase,
  type FinanceYtdTotals,
} from "@/lib/finance-ytd";

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

function ytdResponse(totals: FinanceYtdTotals) {
  return {
    totalRevenue: totals.totalRevenue,
    totalProfit: totals.totalProfit,
    nonPayrollExpenses: null,
    payrollExpenses: null,
    baseWeekEnd: WEEKLY_FINANCE_YTD_BASE.weekEnd,
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

  const metric = await prisma.financeMetric.findUnique({
    where: {
      business_periodStart_periodEnd: {
        business,
        periodStart,
        periodEnd,
      },
    },
  });

  if (sp.get("includeYtd") !== "1") {
    return NextResponse.json({ metric });
  }

  const calculatedYtd = await calculateWeeklyFinanceYtd({
    business,
    periodEnd,
    year,
  });

  return NextResponse.json({
    metric,
    ytd: calculatedYtd
      ? ytdResponse(calculatedYtd)
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
    ...(calculatedYtd ? { ytd: ytdResponse(calculatedYtd) } : {}),
  });
}
