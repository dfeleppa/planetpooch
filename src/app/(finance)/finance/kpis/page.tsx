import { getActiveBusiness } from "@/lib/business-server";
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
import {
  KpiView,
  type KpiCell,
  type QuarterlyHeadlineSummary,
  type QuarterlyKpiWeek,
  type WeeklyHeadlineSummary,
} from "./KpiView";

const PET_RESORT_TAB = "PET_RESORT";
const PET_RESORT_COPY_TAB = "PET_RESORT_COPY";
const PET_RESORT_SEGMENTS = KPI_SEGMENTS.filter(
  (segmentDef) => segmentDef.key !== "MOBILE_GROOMING"
);

function getQuarterWeekStarts(selectedWeek: Date): Date[] {
  const year = selectedWeek.getUTCFullYear();
  const quarter = Math.floor(selectedWeek.getUTCMonth() / 3);
  const firstDay = new Date(Date.UTC(year, quarter * 3, 1));
  const daysUntilSunday = (7 - firstDay.getUTCDay()) % 7;
  firstDay.setUTCDate(firstDay.getUTCDate() + daysUntilSunday);
  return Array.from({ length: 13 }, (_, index) => addWeeks(firstDay, index));
}

type QuarterHeadlinePeriod = {
  totalSales: number;
  totalPayroll: number;
  averagePayrollPercent: number | null;
  aggregatePayrollPercent: number | null;
};

async function getQuarterHeadlinePeriod(
  weekStarts: Date[]
): Promise<QuarterHeadlinePeriod> {
  const rangeStart = weekStarts[0];
  const rangeEnd = addWeeks(weekStarts[weekStarts.length - 1], 1);
  const payrollCheckDates = weekStarts.map((weekStart) => {
    const checkDate = new Date(weekStart);
    checkDate.setUTCDate(checkDate.getUTCDate() + 12);
    return checkDate;
  });

  const [salesRows, payrollRuns] = await Promise.all([
    prisma.$queryRaw<{ weekStart: Date; netSalesCents: bigint }[]>`
      SELECT
        (date_trunc('week', COALESCE("salesDatetime", "completedTime", "createdTime") + interval '1 day') - interval '1 day')::date AS "weekStart",
        COALESCE(SUM("subTotalCents" - "discountCents"), 0)::bigint AS "netSalesCents"
      FROM "MoegoOrder"
      WHERE "businessId" = ${PET_RESORT_BUSINESS_ID}
        AND "status" = ANY(${[...REVENUE_ORDER_STATUSES]})
        AND COALESCE("salesDatetime", "completedTime", "createdTime") >= ${rangeStart}
        AND COALESCE("salesDatetime", "completedTime", "createdTime") < ${rangeEnd}
      GROUP BY 1
    `,
    prisma.financePetResortPayrollRun.findMany({
      where: { checkDate: { in: payrollCheckDates } },
      select: { checkDate: true, amount: true },
    }),
  ]);

  const salesByWeek = new Map(
    salesRows.map((row) => [toWeekParam(new Date(row.weekStart)), Number(row.netSalesCents)])
  );
  const payrollByWeek = new Map<string, number>();
  for (const run of payrollRuns) {
    const payrollWeekStart = new Date(run.checkDate);
    payrollWeekStart.setUTCDate(payrollWeekStart.getUTCDate() - 12);
    const key = toWeekParam(payrollWeekStart);
    payrollByWeek.set(
      key,
      (payrollByWeek.get(key) ?? 0) + Math.round(Number(run.amount) * 100)
    );
  }

  const weeklySales = weekStarts.map(
    (weekStart) => salesByWeek.get(toWeekParam(weekStart)) ?? 0
  );
  const weeklyPayroll = weekStarts.map(
    (weekStart) => payrollByWeek.get(toWeekParam(weekStart)) ?? 0
  );
  const totalSales = weeklySales.reduce((sum, value) => sum + value, 0);
  const totalPayroll = weeklyPayroll.reduce((sum, value) => sum + value, 0);
  const weeklyPercentages = weeklySales.flatMap((sales, index) =>
    sales > 0 && weeklyPayroll[index] > 0
      ? [(weeklyPayroll[index] / sales) * 100]
      : []
  );
  const aggregatePayrollPercent = totalSales > 0 ? (totalPayroll / totalSales) * 100 : null;
  const averagePayrollPercent = weeklyPercentages.length
    ? weeklyPercentages.reduce((sum, value) => sum + value, 0) / weeklyPercentages.length
    : null;

  return { totalSales, totalPayroll, averagePayrollPercent, aggregatePayrollPercent };
}

function percentChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

async function getQuarterlyHeadlineSummary(
  quarterWeekStarts: Date[]
): Promise<QuarterlyHeadlineSummary> {
  const completedWeekStarts = quarterWeekStarts.filter(
    (weekStart) => weekStart.getTime() < currentWeekStart().getTime()
  );
  const completedWeeks = completedWeekStarts.length;
  const emptyRollup = {
    average: null,
    total: null,
    runRate: null,
    lastYearChange: { average: null, total: null, runRate: null },
  };
  if (completedWeeks === 0) {
    return {
      completedWeeks,
      netSales: emptyRollup,
      payroll: emptyRollup,
      payrollPercent: emptyRollup,
    };
  }

  const priorYearAnchor = new Date(completedWeekStarts[0]);
  priorYearAnchor.setUTCFullYear(priorYearAnchor.getUTCFullYear() - 1);
  const priorYearWeekStarts = getQuarterWeekStarts(priorYearAnchor).slice(0, completedWeeks);
  const [current, prior] = await Promise.all([
    getQuarterHeadlinePeriod(completedWeekStarts),
    getQuarterHeadlinePeriod(priorYearWeekStarts),
  ]);

  const averageSales = current.totalSales / completedWeeks;
  const priorAverageSales = prior.totalSales / completedWeeks;
  const averagePayroll = current.totalPayroll / completedWeeks;
  const priorAveragePayroll = prior.totalPayroll / completedWeeks;
  const runRateSales = averageSales * 13;
  const priorRunRateSales = priorAverageSales * 13;
  const runRatePayroll = averagePayroll * 13;
  const priorRunRatePayroll = priorAveragePayroll * 13;

  return {
    completedWeeks,
    netSales: {
      average: Math.round(averageSales),
      total: current.totalSales,
      runRate: Math.round(runRateSales),
      lastYearChange: {
        average: percentChange(averageSales, priorAverageSales),
        total: percentChange(current.totalSales, prior.totalSales),
        runRate: percentChange(runRateSales, priorRunRateSales),
      },
    },
    payroll: {
      average: Math.round(averagePayroll),
      total: current.totalPayroll,
      runRate: Math.round(runRatePayroll),
      lastYearChange: {
        average: percentChange(averagePayroll, priorAveragePayroll),
        total: percentChange(current.totalPayroll, prior.totalPayroll),
        runRate: percentChange(runRatePayroll, priorRunRatePayroll),
      },
    },
    payrollPercent: {
      average: current.averagePayrollPercent,
      total: current.aggregatePayrollPercent,
      runRate: current.aggregatePayrollPercent,
      lastYearChange: {
        average:
          current.averagePayrollPercent !== null && prior.averagePayrollPercent !== null
            ? current.averagePayrollPercent - prior.averagePayrollPercent
            : null,
        total:
          current.aggregatePayrollPercent !== null && prior.aggregatePayrollPercent !== null
            ? current.aggregatePayrollPercent - prior.aggregatePayrollPercent
            : null,
        runRate:
          current.aggregatePayrollPercent !== null && prior.aggregatePayrollPercent !== null
            ? current.aggregatePayrollPercent - prior.aggregatePayrollPercent
            : null,
      },
    },
  };
}

async function getWeeklyHeadlineSummary(weekStart: Date): Promise<WeeklyHeadlineSummary> {
  const weekEndExclusive = new Date(weekStart);
  weekEndExclusive.setUTCDate(weekEndExclusive.getUTCDate() + 7);
  // Resort payroll is paid on the Friday after its Sunday-Saturday pay period.
  const payrollCheckDate = new Date(weekStart);
  payrollCheckDate.setUTCDate(payrollCheckDate.getUTCDate() + 12);
  const [headline, payrollRuns, resortNetSalesRows] = await Promise.all([
    prisma.financeWeeklyKpiHeadline.findUnique({ where: { weekStart } }),
    prisma.financePetResortPayrollRun.findMany({
      where: { checkDate: payrollCheckDate },
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

  const business = await getActiveBusiness();
  const activeTab = business.company === "GROOMING" ? "MOBILE_GROOMING"
    : params.segment === PET_RESORT_TAB ? PET_RESORT_TAB : PET_RESORT_COPY_TAB;
  const showPetResort = activeTab !== "MOBILE_GROOMING";
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
  const quarterWeekStarts =
    activeTab === PET_RESORT_COPY_TAB ? getQuarterWeekStarts(weekStart) : [];
  const headlineSummaryPromise = getWeeklyHeadlineSummary(weekStart);
  const quarterlyHeadlineSummaryPromise =
    activeTab === PET_RESORT_COPY_TAB
      ? getQuarterlyHeadlineSummary(quarterWeekStarts)
      : Promise.resolve(null);
  const staffHoursByWeekPromise =
    showPetResort
      ? getResortStaffHoursByWeek([
          weekStart,
          previousWeekStart,
          ...quarterWeekStarts,
        ])
      : Promise.resolve(new Map<string, number>());

  if (showPetResort) {
    const [
      valueRows,
      previousValueRows,
      standingRows,
      quarterlyValueRows,
      quarterlyPayrollRuns,
      staffHoursByWeek,
      headlineSummary,
      quarterlyHeadlineSummary,
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
      quarterWeekStarts.length
        ? prisma.kpiWeeklyValue.findMany({
            where: {
              segment: { in: PET_RESORT_SEGMENTS.map((segmentDef) => segmentDef.key) },
              weekStart: { in: quarterWeekStarts },
            },
            select: { segment: true, weekStart: true, metricKey: true, value: true },
          })
        : Promise.resolve([]),
      quarterWeekStarts.length
        ? prisma.financePetResortPayrollRun.findMany({
            where: {
              checkDate: {
                in: quarterWeekStarts.map((quarterWeekStart) => {
                  const checkDate = new Date(quarterWeekStart);
                  checkDate.setUTCDate(checkDate.getUTCDate() + 12);
                  return checkDate;
                }),
              },
            },
            select: { checkDate: true, amount: true },
          })
        : Promise.resolve([]),
      staffHoursByWeekPromise,
      headlineSummaryPromise,
      quarterlyHeadlineSummaryPromise,
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

    const quarterlySegmentsData: Record<string, QuarterlyKpiWeek[]> = {};
    const quarterlyPayrollByWeek: Record<string, number> = {};
    for (const run of quarterlyPayrollRuns) {
      const payrollWeekStart = new Date(run.checkDate);
      payrollWeekStart.setUTCDate(payrollWeekStart.getUTCDate() - 12);
      const payrollWeek = toWeekParam(payrollWeekStart);
      quarterlyPayrollByWeek[payrollWeek] =
        (quarterlyPayrollByWeek[payrollWeek] ?? 0) + Math.round(Number(run.amount) * 100);
    }
    for (const segDef of PET_RESORT_SEGMENTS) {
      quarterlySegmentsData[segDef.key] = quarterWeekStarts.map((quarterWeekStart) => {
        const quarterWeek = toWeekParam(quarterWeekStart);
        const rows = quarterlyValueRows.filter(
          (row) =>
            row.segment === segDef.key &&
            row.weekStart.getTime() === quarterWeekStart.getTime()
        );
        const valueByKey = new Map(rows.map((row) => [row.metricKey, row.value]));
        const quarterData: Record<string, KpiCell> = {};
        for (const metric of segDef.metrics) {
          quarterData[metric.key] = {
            value: valueByKey.get(metric.key) ?? null,
            previousValue: null,
            target: null,
            average: null,
          };
        }
        return {
          week: quarterWeek,
          data: withDerivedKpiCells(
            segDef.key,
            withPayrollStaffHours(
              segDef.key,
              quarterData,
              staffHoursByWeek,
              quarterWeek,
              toWeekParam(addWeeks(quarterWeekStart, -1))
            )
          ),
        };
      });
    }

    return (
      <div
        className={`pp-kpi-print-page ${
          activeTab === PET_RESORT_COPY_TAB ? "pp-kpi-quarterly-print-page" : ""
        }`}
      >
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
          activeTab={activeTab}
          allSegmentsData={allData}
          quarterlySegmentsData={quarterlySegmentsData}
          quarterlyPayrollByWeek={quarterlyPayrollByWeek}
          quarterlyHeadlineSummary={quarterlyHeadlineSummary ?? undefined}
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
