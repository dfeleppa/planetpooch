import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { KpiSegment } from "@prisma/client";
import {
  DEFAULT_SEGMENT,
  KPI_SEGMENTS,
  calculateDaycareDerivedMetricValues,
  getSegmentDef,
  isValidSegment,
} from "@/lib/kpis";
import { addWeeks, currentWeekStart, fromWeekParam, isValidWeekParam, toWeekParam } from "@/lib/week";
import { resolveStandingAmount, type StandingRow } from "@/lib/kpi-standing";
import { KpiView, type KpiCell } from "./KpiView";

const ALL_TAB = "ALL";

function isAllTab(value: string | undefined): boolean {
  return value === ALL_TAB;
}

function withDerivedKpiCells(
  segment: KpiSegment,
  data: Record<string, KpiCell>
): Record<string, KpiCell> {
  if (segment !== "DAYCARE") return data;

  const values = Object.fromEntries(
    Object.entries(data).map(([key, cell]) => [key, cell.value])
  );
  const previousValues = Object.fromEntries(
    Object.entries(data).map(([key, cell]) => [key, cell.previousValue])
  );
  const derived = calculateDaycareDerivedMetricValues(values);
  const previousDerived = calculateDaycareDerivedMetricValues(previousValues);
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

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; week?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;

  const showAll = isAllTab(params.segment);
  const segment: KpiSegment =
    !showAll && params.segment && isValidSegment(params.segment) ? params.segment : DEFAULT_SEGMENT;

  let weekStart: Date;
  if (isValidWeekParam(params.week)) {
    weekStart = fromWeekParam(params.week);
  } else {
    const latest = await prisma.kpiWeeklyValue.findFirst({
      where: showAll ? {} : { segment },
      orderBy: { weekStart: "desc" },
      select: { weekStart: true },
    });
    weekStart = latest?.weekStart ?? currentWeekStart();
  }

  const week = toWeekParam(weekStart);
  const previousWeekStart = addWeeks(weekStart, -1);

  if (showAll) {
    const [valueRows, previousValueRows, standingRows] = await Promise.all([
      prisma.kpiWeeklyValue.findMany({
        where: { weekStart },
        select: { segment: true, metricKey: true, value: true },
      }),
      prisma.kpiWeeklyValue.findMany({
        where: { weekStart: previousWeekStart },
        select: { segment: true, metricKey: true, value: true },
      }),
      prisma.kpiStandingValue.findMany({
        where: { effectiveWeekStart: { lte: weekStart } },
        select: { segment: true, metricKey: true, field: true, amount: true, effectiveWeekStart: true },
      }),
    ]);

    const allData: Record<string, Record<string, KpiCell>> = {};
    for (const segDef of KPI_SEGMENTS) {
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
      allData[segDef.key] = withDerivedKpiCells(segDef.key, data);
    }

    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">KPIs</h1>
          <p className="text-gray-500 mt-1">
            Weekly key performance indicators by business segment
          </p>
        </div>

        <KpiView segment={segment} week={week} data={{}} activeTab={ALL_TAB} allSegmentsData={allData} />
      </div>
    );
  }

  const [valueRows, previousValueRows, standingRows] = await Promise.all([
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
  data = withDerivedKpiCells(segment, data);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">KPIs</h1>
        <p className="text-gray-500 mt-1">
          Weekly key performance indicators by business segment
        </p>
      </div>

      <KpiView segment={segment} week={week} data={data} activeTab={segment} />
    </div>
  );
}
