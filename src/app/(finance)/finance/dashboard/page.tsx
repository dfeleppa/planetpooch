import Link from "next/link";
import { KpiSegment } from "@prisma/client";
import { requireSuperAdmin } from "@/lib/auth-helpers";
import { getActiveBusiness } from "@/lib/business-server";
import { prisma } from "@/lib/prisma";
import { PET_RESORT_BUSINESS_ID } from "@/lib/moego/businesses";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { KPI_SEGMENTS, calculateBoardingDerivedMetricValues, calculateDaycareDerivedMetricValues, type KpiFormat } from "@/lib/kpis";
import { addWeeks, currentWeekStart, formatWeekRange, toWeekParam } from "@/lib/week";
import { formatKpiValue } from "@/lib/utils";
import { NetProfitChart } from "./NetProfitChart";

const PRIMARY_METRICS = [
  ["BOARDING", "occupancy_rate"], ["BOARDING", "revenue"],
  ["TRAINING", "group_revenue"], ["TRAINING", "one_on_one_revenue"],
  ["DAYCARE", "avg_daily_occupancy"], ["DAYCARE", "evaluations"],
  ["IN_HOUSE_GROOMING", "revenue"], ["IN_HOUSE_GROOMING", "total_pets_serviced"],
] as const;

function quarterWeeks(today: Date) {
  const start = new Date(Date.UTC(today.getUTCFullYear(), Math.floor(today.getUTCMonth() / 3) * 3, 1));
  start.setUTCDate(start.getUTCDate() + (7 - start.getUTCDay()) % 7);
  const current = currentWeekStart();
  const weeks: Date[] = [];
  for (let week = start; week < current; week = addWeeks(week, 1)) weeks.push(week);
  return weeks;
}

function rollup(values: Array<number | null>, format: KpiFormat) {
  const present = values.filter((value): value is number => value !== null);
  if (!present.length) return { total: null, average: null };
  // A percentage is a rate: its quarter value is the average of available weekly rates.
  const total = format === "percent" ? null : present.reduce((sum, value) => sum + value, 0);
  return { total, average: present.reduce((sum, value) => sum + value, 0) / present.length };
}

export default async function FinanceDashboardPage() {
  await requireSuperAdmin();
  const business = await getActiveBusiness();
  const today = new Date();
  const quarter = Math.floor(today.getUTCMonth() / 3);
  const quarterStart = new Date(Date.UTC(today.getUTCFullYear(), quarter * 3, 1));
  const from = quarterStart.toISOString().slice(0, 10);
  const to = today.toISOString().slice(0, 10);
  const weeks = quarterWeeks(today);
  const previousWeek = addWeeks(currentWeekStart(), -1);
  const weekDates = [...new Map([...weeks, previousWeek].map((date) => [toWeekParam(date), date])).values()];
  const segments = [...new Set(PRIMARY_METRICS.map(([segment]) => segment))] as KpiSegment[];
  const [rows, salesRows, payrollRuns] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({ where: { segment: { in: segments }, weekStart: { in: weekDates } }, select: { segment: true, weekStart: true, metricKey: true, value: true } }),
    prisma.$queryRaw<{ weekStart: Date; cents: bigint }[]>`
      SELECT (date_trunc('week', COALESCE("salesDatetime", "completedTime", "createdTime") + interval '1 day') - interval '1 day')::date AS "weekStart",
        COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS cents
      FROM "MoegoOrder"
      WHERE "businessId" = ${PET_RESORT_BUSINESS_ID}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
        AND COALESCE("salesDatetime", "completedTime", "createdTime") >= ${weeks[0] ?? previousWeek}
        AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${currentWeekStart()}
      GROUP BY 1`,
    prisma.financePetResortPayrollRun.findMany({ where: { checkDate: { in: weekDates.map((date) => { const check = new Date(date); check.setUTCDate(check.getUTCDate() + 12); return check; }) } }, select: { checkDate: true, amount: true } }),
  ]);
  const lookup = new Map(rows.map((row) => [`${row.segment}:${toWeekParam(row.weekStart)}:${row.metricKey}`, row.value]));
  const value = (segment: KpiSegment, week: Date, key: string): number | null => {
    const prefix = `${segment}:${toWeekParam(week)}:`;
    const source = Object.fromEntries(rows.filter((row) => row.segment === segment && toWeekParam(row.weekStart) === toWeekParam(week)).map((row) => [row.metricKey, row.value]));
    const derived = segment === "DAYCARE" ? calculateDaycareDerivedMetricValues(source) : segment === "BOARDING" ? calculateBoardingDerivedMetricValues(source) : {};
    const derivedValue = (derived as Record<string, number | undefined>)[key];
    return derivedValue ?? lookup.get(`${prefix}${key}`) ?? null;
  };
  const sales = new Map(salesRows.map((row) => [toWeekParam(row.weekStart), Number(row.cents)]));
  const payroll = new Map<string, number>();
  for (const run of payrollRuns) {
    const date = new Date(run.checkDate); date.setUTCDate(date.getUTCDate() - 12);
    const key = toWeekParam(date);
    payroll.set(key, (payroll.get(key) ?? 0) + Math.round(Number(run.amount) * 100));
  }
  const headline = [
    { label: "Pet Resort net sales", format: "currency" as const, values: weeks.map((week) => sales.get(toWeekParam(week)) ?? 0), last: sales.get(toWeekParam(previousWeek)) ?? 0 },
    { label: "Pet Resort payroll", format: "currency" as const, values: weeks.map((week) => payroll.get(toWeekParam(week)) ?? null), last: payroll.get(toWeekParam(previousWeek)) ?? null },
    { label: "Payroll % of net sales", format: "percent" as const, values: weeks.map((week) => { const s = sales.get(toWeekParam(week)) ?? 0; const p = payroll.get(toWeekParam(week)); return s && p !== undefined ? Math.round(p / s * 10000) : null; }), last: (() => { const s = sales.get(toWeekParam(previousWeek)) ?? 0; const p = payroll.get(toWeekParam(previousWeek)); return s && p !== undefined ? Math.round(p / s * 10000) : null; })() },
  ];
  const metrics = PRIMARY_METRICS.map(([segment, key]) => {
    const definition = KPI_SEGMENTS.find((item) => item.key === segment)!;
    const metric = definition.metrics.find((item) => item.key === key)!;
    return { segment, key, label: `${definition.label} · ${metric.label}`, format: metric.format, last: value(segment, previousWeek, key), values: weeks.map((week) => value(segment, week, key)) };
  });
  const cards = [...headline, ...metrics];
  return <div className="space-y-7">
    <div><h2 className="text-xl font-semibold text-gray-900">Dashboard</h2><p className="mt-1 text-gray-500">Q{quarter + 1} {today.getUTCFullYear()} · Previous week {formatWeekRange(previousWeek)}</p></div>
    <NetProfitChart from={from} to={to} business={business.moegoId} />
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-lg font-semibold text-gray-900">Main KPIs</h3><p className="text-sm text-gray-500">Quarter totals and averages use completed Sunday–Saturday weeks with available values ({weeks.length} weeks).</p></div><Link href={`/finance/kpis?segment=PET_RESORT_COPY&week=${toWeekParam(previousWeek)}`} className="text-sm font-medium text-blue-700 hover:underline">View KPIs →</Link></div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{cards.map((card) => {
        const summary = rollup(card.values, card.format);
        return <div key={card.label} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"><p className="text-sm font-medium text-gray-600">{card.label}</p><div className="mt-4 grid grid-cols-3 gap-2 text-sm"><div><p className="text-xs text-gray-500">Previous week</p><p className="mt-1 font-semibold tabular-nums">{formatKpiValue(card.last, card.format)}</p></div><div><p className="text-xs text-gray-500">Quarter total</p><p className="mt-1 font-semibold tabular-nums">{summary.total === null ? "—" : formatKpiValue(summary.total, card.format)}</p></div><div><p className="text-xs text-gray-500">Weekly average</p><p className="mt-1 font-semibold tabular-nums">{formatKpiValue(summary.average, card.format)}</p></div></div></div>;
      })}</div>
    </section>
  </div>;
}
