import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { Role } from "@prisma/client";

function isSuperAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
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

  const requestedYear = Number(sp.get("year"));
  const ytdYear = Number.isInteger(requestedYear)
    ? requestedYear
    : periodEnd.getUTCFullYear();
  const ytdStart = new Date(Date.UTC(ytdYear, 0, 1));
  const ytdTotals = await prisma.financeMetric.aggregate({
    where: {
      business,
      periodEnd: {
        gte: ytdStart,
        lte: periodEnd,
      },
    },
    _sum: {
      totalRevenue: true,
      totalProfit: true,
      nonPayrollExpenses: true,
      payrollExpenses: true,
    },
  });

  return NextResponse.json({
    metric,
    ytd: {
      totalRevenue: ytdTotals._sum.totalRevenue,
      totalProfit: ytdTotals._sum.totalProfit,
      nonPayrollExpenses: ytdTotals._sum.nonPayrollExpenses,
      payrollExpenses: ytdTotals._sum.payrollExpenses,
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
    return NextResponse.json({ error: "business, periodStart, and periodEnd are required" }, { status: 400 });
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
    "totalRevenue", "totalProfit", "nonPayrollExpenses", "payrollExpenses", "totalCustomers",
    "totalAdSpend", "totalConversions",
    "metaAdSpend", "metaRevenue", "googleAdSpend", "googleRevenue",
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

  return NextResponse.json({ metric });
}
