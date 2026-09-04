import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { KpiSegment } from "@prisma/client";
import {
  DAYCARE_STAFF_HOURS_METRIC_KEY,
  KPI_SEGMENTS,
  calculateBoardingDerivedMetricValues,
  calculateDaycareDerivedMetricValues,
  getSegmentDef,
} from "@/lib/kpis";
import { addWeeks, currentWeekStart, fromWeekParam, isValidWeekParam, toWeekParam } from "@/lib/week";
import { resolveStandingAmount, type StandingRow } from "@/lib/kpi-standing";
import { PET_RESORT_BUSINESS_ID } from "@/lib/moego/businesses";
import { REVENUE_ORDER_STATUSES } from "@/lib/moego/metrics";
import { getResortStaffHoursByWeek } from "@/lib/payroll-kpis";
import { KpiView, type KpiCell, type WeeklyHeadlineSummary } from "./KpiView";

const PET_RESORT_TAB = "PET_RESORT";
const PET_RESORT_SEGMENTS = KPI_SEGMENTS.filter(
  (segmentDef) => segmentDef.key !== "MOBILE_GROOMING"
);

function shortDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
}

async function getWeeklyHeadlineSummary(weekStart: Date): Promise<WeeklyHeadlineSummary> {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);
  const payPeriod = `${shortDate(weekStart)} to ${shortDate(weekEnd)}`;
  const [headline, payrollRuns, resortNetSalesRows] = await Promise.all([
    prisma.financeWeeklyKpiHeadline.findUnique({ where: { weekStart } }),
    prisma.financePetResortPayrollRun.findMany({
      where: { payPeriod },
      select: { amount: true },
    }),
    prisma.$queryRaw<{ netSalesCents: bigint }[]>`
      SELECT COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "netSalesCents"
      FROM "MoegoOrder"
      WHERE "businessId" = ${PET_RESORT_BUSINESS_ID}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
        AND COALESCE("salesDatetime", "completedTime", "createdTime") >= ${weekStart}
        AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${weekEndExclusive}
    `,
  ]);
  const resortPayrollCents = payrollRuns.length
    ? Math.round(payrollRuns.reduce((sum, run) => sum + Number(run.amount), 0) * 100)
    : null;
  const resortNetSalesCents = Number(resortNetSalesRows[0]?.netSalesCents ?? 0);

  return {
    mobileNetSalesCents: headline?.mobileNetSalesCents ?? null,
    resortNetSalesCents,
    resortPayrollCents,
    resortPayrollPercent:
      resortPayrollCents !== null && resortNetSalesCents
        ? (resortPayrollCents / resortNetSalesCents) * 100
        : null,
  };
}

function withDerivedKpiCells(
  segment: KpiSegment,
  data: Record<string, KpiCell>
): Record<string, KpiCell> {
  if (segment !== "DAYCARE" && segment !== "BOARDING") return data;

  const values = Object.fromEntries(
    Object.entries(data).map(([key, cell]) => [key, cell.value])
  );
  const previousValues = Object.fromEntries(
    Object.entries(data).map(([key, cell]) => [key, cell.previousValue])
  );
  const derived =
    segment === "DAYCARE"
      ? calculateDaycareDerivedMetricValues(values)
      : calculateBoardingDerivedMetricValues(values);
  const previousDerived =
    segment === "DAYCARE"
      ? calculateDaycareDerivedMetricValues(previousValues)
      : calculateBoardingDerivedMetricValues(previousValues);
  if (Object.keys(derived).length === 0 && Object.keys(previousDerived).length === 0) return data;

  const next = { ...data };
  for (const [key, value] of Object.entries(derived)) {
    if (!next[key]) continue;
    next[key] = { ...next[key], value };
  }
  for (const [key, previousValue] of Object.entries(previousDerived)) {
    if (!next[key]) continue;
    next[key] = { ...next[key], previousValue };
  }
  return next;
}

function withPayrollStaffHours(
  segment: KpiSegment,
  data: Record<string, KpiCell>,
  staffHoursByWeek: Map<string, number>,
  week: string,
  previousWeek: string
): Record<string, KpiCell> {
  if (segment !== "DAYCARE" || !data[DAYCARE_STAFF_HOURS_METRIC_KEY]) return data;

  return {
    ...data,
    [DAYCARE_STAFF_HOURS_METRIC_KEY]: {
      ...data[DAYCARE_STAFF_HOURS_METRIC_KEY],
      value: staffHoursByWeek.get(week) ?? null,
      previousValue: staffHoursByWeek.get(previousWeek) ?? null,
    },
  };
}

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; week?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;

  const showPetResort = params.segment !== "MOBILE_GROOMING";
  const segment: KpiSegment = "MOBILE_GROOMING";

  let weekStart: Date;
  if (isValidWeekParam(params.week)) {
    weekStart = fromWeekParam(params.week);
  } else {
    const latest = await prisma.kpiWeeklyValue.findFirst({
      where: showPetResort
        ? { segment: { in: PET_RESORT_SEGMENTS.map((segmentDef) => segmentDef.key) } }
        : { segment },
      orderBy: { weekStart: "desc" },
      select: { weekStart: true },
    });
    weekStart = latest?.weekStart ?? currentWeekStart();
  }

  const week = toWeekParam(weekStart);
  const previousWeekStart = addWeeks(weekStart, -1);
  const previousWeek = toWeekParam(previousWeekStart);
  const headlineSummaryPromise = getWeeklyHeadlineSummary(weekStart);
  const staffHoursByWeekPromise =
    showPetResort
      ? getResortStaffHoursByWeek([weekStart, previousWeekStart])
      : Promise.resolve(new Map<string, number>());

  if (showPetResort) {
    const [
      valueRows,
      previousValueRows,
      standingRows,
      staffHoursByWeek,
      headlineSummary,
    ] = await Promise.all([
      prisma.kpiWeeklyValue.findMany({
        where: {
          segment: { in: PET_RESORT_SEGMENTS.map((segmentDef) => segmentDef.key) },
          weekStart,
        },
        select: { segment: true, metricKey: true, value: true },
      }),
      prisma.kpiWeeklyValue.findMany({
        where: {
          segment: { in: PET_RESORT_SEGMENTS.map((segmentDef) => segmentDef.key) },
          weekStart: previousWeekStart,
        },
        select: { segment: true, metricKey: true, value: true },
      }),
      prisma.kpiStandingValue.findMany({
        where: {
          segment: { in: PET_RESORT_SEGMENTS.map((segmentDef) => segmentDef.key) },
          effectiveWeekStart: { lte: weekStart },
        },
        select: { segment: true, metricKey: true, field: true, amount: true, effectiveWeekStart: true },
      }),
      staffHoursByWeekPromise,
      headlineSummaryPromise,
    ]);

    const allData: Record<string, Record<string, KpiCell>> = {};
    for (const segDef of PET_RESORT_SEGMENTS) {
      const segValues = valueRows.filter((r) => r.segment === segDef.key);
      const previousSegValues = previousValueRows.filter((r) => r.segment === segDef.key);
      const segStanding = standingRows.filter((r) => r.segment === segDef.key) as StandingRow[];
      const valueByKey = new Map(segValues.map((r) => [r.metricKey, r.value]));
      const previousValueByKey = new Map(previousSegValues.map((r) => [r.metricKey, r.value]));

      const data: Record<string, KpiCell> = {};
      for (const metric of segDef.metrics) {
        const sourceKey = metric.mirrorsKey ?? metric.key;
        data[metric.key] = {
          value: valueByKey.get(metric.key) ?? null,
          previousValue: previousValueByKey.get(metric.key) ?? null,
          target: resolveStandingAmount(segStanding, sourceKey, "TARGET", weekStart),
          average: resolveStandingAmount(segStanding, sourceKey, "AVERAGE", weekStart),
        };
      }
      allData[segDef.key] = withDerivedKpiCells(
        segDef.key,
        withPayrollStaffHours(segDef.key, data, staffHoursByWeek, week, previousWeek)
      );
    }

    return (
      <div className="pp-kpi-print-page">
        <div className="pp-kpi-screen-heading mb-6">
          <h2 className="text-xl font-semibold text-gray-900">KPIs</h2>
          <p className="text-gray-500 mt-1">
            Weekly key performance indicators for Pet Resort and Mobile Grooming
          </p>
        </div>

        <KpiView
          segment={segment}
          week={week}
          data={{}}
          activeTab={PET_RESORT_TAB}
          allSegmentsData={allData}
          headlineSummary={headlineSummary}
        />
      </div>
    );
  }

  const [
    valueRows,
    previousValueRows,
    standingRows,
    staffHoursByWeek,
    headlineSummary,
  ] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { segment, weekStart },
      select: { metricKey: true, value: true },
    }),
    prisma.kpiWeeklyValue.findMany({
      where: { segment, weekStart: previousWeekStart },
      select: { metricKey: true, value: true },
    }),
    prisma.kpiStandingValue.findMany({
      where: { segment, effectiveWeekStart: { lte: weekStart } },
      select: { metricKey: true, field: true, amount: true, effectiveWeekStart: true },
    }),
    staffHoursByWeekPromise,
    headlineSummaryPromise,
  ]);

  const valueByKey = new Map(valueRows.map((r) => [r.metricKey, r.value]));
  const previousValueByKey = new Map(previousValueRows.map((r) => [r.metricKey, r.value]));
  const standing = standingRows as StandingRow[];

  let data: Record<string, KpiCell> = {};
  for (const metric of getSegmentDef(segment).metrics) {
    const sourceKey = metric.mirrorsKey ?? metric.key;
    data[metric.key] = {
      value: valueByKey.get(metric.key) ?? null,
      previousValue: previousValueByKey.get(metric.key) ?? null,
      target: resolveStandingAmount(standing, sourceKey, "TARGET", weekStart),
      average: resolveStandingAmount(standing, sourceKey, "AVERAGE", weekStart),
    };
  }
  data = withPayrollStaffHours(segment, data, staffHoursByWeek, week, previousWeek);
  data = withDerivedKpiCells(segment, data);

  return (
    <div className="pp-kpi-print-page">
      <div className="pp-kpi-screen-heading mb-6">
        <h2 className="text-xl font-semibold text-gray-900">KPIs</h2>
        <p className="text-gray-500 mt-1">
          Weekly key performance indicators for Pet Resort and Mobile Grooming
        </p>
      </div>

      <KpiView
        segment={segment}
        week={week}
        data={data}
        activeTab={segment}
        headlineSummary={headlineSummary}
      />
    </div>
  );
}
