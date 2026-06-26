import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  fetchAllOpportunities,
  GhlApiError,
  GhlConfigError,
} from "@/lib/ghl/client";

export const maxDuration = 120;

type CachedAgg = { data: AggData; cachedAt: number };
const CACHE_TTL_MS = 10 * 60 * 1000;
let cache: CachedAgg | null = null;

type AggData = {
  ghlOpportunities: {
    id: string;
    monetaryValue: number;
    status: string;
    source: string;
    createdAt: string;
    service: string | null;
  }[];
  moegoRevenueCents: number;
  moegoCustomerCount: number;
  metaSpendCents: number;
};

type FinanceStatementSource = {
  totalRevenue: number | null;
  totalProfit: number | null;
  nonPayrollExpenses: number | null;
  payrollExpenses: number | null;
} | null;

type WindowSummary = {
  filteredOpps: number;
  ghlRevenueCents: number;
  moegoRevenueCents: number;
  moegoCustomerCount: number;
  combinedRevenueCents: number;
  combinedCustomers: number;
  totalConversions: number;
  metaSpendCents: number;
  metaRevenueCents: number;
};

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfUtcYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

function manualBusinessKey(business: string): string {
  if (business === "mobile-grooming") return "mobile-grooming-manual";
  if (business === "pet-resort") return "pet-resort-manual";
  return "all-businesses-manual";
}

function hasValue(value: number | null | undefined): value is number {
  return value !== null && value !== undefined;
}

function buildStatement(revenueFallbackCents: number, source: FinanceStatementSource) {
  const incomeCents = source?.totalRevenue ?? revenueFallbackCents;
  const totalProfitCents = source?.totalProfit ?? null;
  const expensesCents = source?.nonPayrollExpenses ?? null;
  const payrollCents = source?.payrollExpenses ?? null;
  const hasExpenseBreakdown = hasValue(expensesCents) || hasValue(payrollCents);
  const operatingExpensesCents = hasExpenseBreakdown
    ? (expensesCents ?? 0) + (payrollCents ?? 0)
    : hasValue(totalProfitCents)
      ? incomeCents - totalProfitCents
      : null;
  const netProfitCents = hasValue(totalProfitCents)
    ? totalProfitCents
    : hasValue(operatingExpensesCents)
      ? incomeCents - operatingExpensesCents
      : null;

  return {
    income: incomeCents,
    operatingExpenses: operatingExpensesCents,
    expenses: expensesCents,
    payroll: payrollCents,
    netProfit: netProfitCents,
  };
}

async function loadAggData(forceRefresh: boolean): Promise<AggData> {
  if (!forceRefresh && cache && Date.now() - cache.cachedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const [opportunities, serviceRows] = await Promise.all([
    fetchAllOpportunities(),
    prisma.ghlOpportunityService.findMany(),
  ]);

  const serviceMap = new Map<string, string>();
  for (const r of serviceRows) serviceMap.set(r.opportunityId, r.service);

  const ghlOpportunities = opportunities.map((o) => ({
    id: o.id,
    monetaryValue: o.monetaryValue,
    status: o.status,
    source: o.source,
    createdAt: o.createdAt,
    service: serviceMap.get(o.id) ?? null,
  }));

  const [moegoRevenue, moegoCustomerCount, metaSpend] = await Promise.all([
    prisma.moegoOrder.aggregate({ _sum: { paidCents: true } }),
    prisma.moegoCustomer.count(),
    prisma.metaAdInsight.aggregate({ _sum: { spendCents: true } }),
  ]);

  const data: AggData = {
    ghlOpportunities,
    moegoRevenueCents: moegoRevenue._sum.paidCents ?? 0,
    moegoCustomerCount,
    metaSpendCents: metaSpend._sum.spendCents ?? 0,
  };

  cache = { data, cachedAt: Date.now() };
  return data;
}

async function summarizeWindow(
  agg: AggData,
  business: string,
  from: Date,
  toExclusive: Date,
): Promise<WindowSummary> {
  const fromMs = from.getTime();
  const toMs = toExclusive.getTime();

  let filteredOpps = agg.ghlOpportunities.filter((o) => {
    const t = new Date(o.createdAt).getTime();
    return t >= fromMs && t < toMs;
  });

  if (business === "mobile-grooming") {
    filteredOpps = filteredOpps.filter((o) => o.service === "mobile");
  } else if (business === "pet-resort") {
    filteredOpps = filteredOpps.filter((o) => o.service === "resort");
  }

  const ghlRevenueCents = filteredOpps.reduce(
    (s, o) => s + Math.round(o.monetaryValue * 100),
    0,
  );
  const totalConversions = filteredOpps.length;

  const metaOpps = filteredOpps.filter(
    (o) => o.source.toLowerCase() === "meta ads",
  );
  const metaRevenueCents = metaOpps.reduce(
    (s, o) => s + Math.round(o.monetaryValue * 100),
    0,
  );

  let moegoRevenueCents = 0;
  let moegoCustomerCount = 0;
  let metaSpendCents = 0;

  if (business === "" || business === "mobile-grooming" || business === "pet-resort") {
    const [moegoRevWindow, moegoCustWindow, metaSpendWindow] =
      await Promise.all([
        prisma.moegoOrder.aggregate({
          where: { createdTime: { gte: from, lt: toExclusive } },
          _sum: { paidCents: true },
        }),
        prisma.moegoCustomer.count({
          where: { createdTime: { gte: from, lt: toExclusive } },
        }),
        prisma.metaAdInsight.aggregate({
          where: {
            date: {
              gte: new Date(from.toISOString().slice(0, 10)),
              lt: new Date(toExclusive.toISOString().slice(0, 10)),
            },
          },
          _sum: { spendCents: true },
        }),
      ]);
    moegoRevenueCents = moegoRevWindow._sum.paidCents ?? 0;
    moegoCustomerCount = moegoCustWindow;
    metaSpendCents = metaSpendWindow._sum.spendCents ?? 0;
  }

  const combinedRevenueCents =
    business === "" ? ghlRevenueCents + moegoRevenueCents : ghlRevenueCents;
  const combinedCustomers =
    business === ""
      ? totalConversions + moegoCustomerCount
      : totalConversions;

  return {
    filteredOpps: filteredOpps.length,
    ghlRevenueCents,
    moegoRevenueCents,
    moegoCustomerCount,
    combinedRevenueCents,
    combinedCustomers,
    totalConversions,
    metaSpendCents,
    metaRevenueCents,
  };
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || session.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const business = sp.get("business") ?? "";
  const forceRefresh = sp.get("refresh") === "1";

  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  const from = parseDate(sp.get("from")) ?? defaultFrom;
  const to = parseDate(sp.get("to")) ?? now;
  const toExclusive = addDays(to, 1);

  let agg: AggData;
  try {
    agg = await loadAggData(forceRefresh);
  } catch (e) {
    if (e instanceof GhlConfigError) {
      return NextResponse.json({ error: e.message }, { status: 500 });
    }
    if (e instanceof GhlApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
  }

  const ytdFrom = startOfUtcYear(from);
  const financeBusiness = manualBusinessKey(business);
  const [monthSummary, ytdSummary, manualMetric, ytdManualTotals] =
    await Promise.all([
      summarizeWindow(agg, business, from, toExclusive),
      summarizeWindow(agg, business, ytdFrom, toExclusive),
      prisma.financeMetric.findUnique({
        where: {
          business_periodStart_periodEnd: {
            business: financeBusiness,
            periodStart: from,
            periodEnd: to,
          },
        },
        select: {
          totalRevenue: true,
          totalProfit: true,
          nonPayrollExpenses: true,
          payrollExpenses: true,
        },
      }),
      prisma.financeMetric.aggregate({
        where: {
          business: financeBusiness,
          periodStart: { gte: ytdFrom },
          periodEnd: { lte: to },
        },
        _sum: {
          totalRevenue: true,
          totalProfit: true,
          nonPayrollExpenses: true,
          payrollExpenses: true,
        },
      }),
    ]);

  const statement = buildStatement(monthSummary.combinedRevenueCents, manualMetric);
  const ytdStatement = buildStatement(ytdSummary.combinedRevenueCents, {
    totalRevenue: ytdManualTotals._sum.totalRevenue,
    totalProfit: ytdManualTotals._sum.totalProfit,
    nonPayrollExpenses: ytdManualTotals._sum.nonPayrollExpenses,
    payrollExpenses: ytdManualTotals._sum.payrollExpenses,
  });

  return NextResponse.json({
    metric: {
      totalRevenue: monthSummary.combinedRevenueCents,
      totalProfit: statement.netProfit,
      totalCustomers: monthSummary.combinedCustomers,
      totalAdSpend: monthSummary.metaSpendCents,
      totalConversions: monthSummary.totalConversions,
      metaAdSpend: monthSummary.metaSpendCents,
      metaRevenue: monthSummary.metaRevenueCents,
      googleAdSpend: null,
      googleRevenue: null,
      statement: {
        ...statement,
        ytdRevenue: ytdStatement.income,
        ytdNetProfit: ytdStatement.netProfit,
      },
    },
    debug: {
      ghlOpportunities: monthSummary.filteredOpps,
      ghlRevenueCents: monthSummary.ghlRevenueCents,
      moegoRevenueCents: monthSummary.moegoRevenueCents,
      moegoCustomerCount: monthSummary.moegoCustomerCount,
      manualFinanceMetric: Boolean(manualMetric),
    },
  });
}
