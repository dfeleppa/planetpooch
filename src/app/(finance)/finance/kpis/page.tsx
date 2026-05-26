import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { KpiSegment } from "@prisma/client";
import { DEFAULT_SEGMENT, getSegmentDef, isValidSegment } from "@/lib/kpis";
import { currentWeekStart, fromWeekParam, isValidWeekParam, toWeekParam } from "@/lib/week";
import { resolveStandingAmount, type StandingRow } from "@/lib/kpi-standing";
import { KpiView, type KpiCell } from "./KpiView";

export default async function KpisPage({
  searchParams,
}: {
  searchParams: Promise<{ segment?: string; week?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;

  const segment: KpiSegment =
    params.segment && isValidSegment(params.segment) ? params.segment : DEFAULT_SEGMENT;

  let weekStart: Date;
  if (isValidWeekParam(params.week)) {
    weekStart = fromWeekParam(params.week);
  } else {
    const latest = await prisma.kpiWeeklyValue.findFirst({
      where: { segment },
      orderBy: { weekStart: "desc" },
      select: { weekStart: true },
    });
    weekStart = latest?.weekStart ?? currentWeekStart();
  }

  const week = toWeekParam(weekStart);

  const [valueRows, standingRows] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { segment, weekStart },
      select: { metricKey: true, value: true },
    }),
    prisma.kpiStandingValue.findMany({
      where: { segment, effectiveWeekStart: { lte: weekStart } },
      select: { metricKey: true, field: true, amount: true, effectiveWeekStart: true },
    }),
  ]);

  const valueByKey = new Map(valueRows.map((r) => [r.metricKey, r.value]));
  const standing = standingRows as StandingRow[];

  // value comes from this week's row; target/average are resolved from the
  // latest standing value in effect on or before this week. Forecast metrics
  // mirror their Actuals counterpart's target/average via mirrorsKey.
  const data: Record<string, KpiCell> = {};
  for (const metric of getSegmentDef(segment).metrics) {
    const sourceKey = metric.mirrorsKey ?? metric.key;
    data[metric.key] = {
      value: valueByKey.get(metric.key) ?? null,
      target: resolveStandingAmount(standing, sourceKey, "TARGET", weekStart),
      average: resolveStandingAmount(standing, sourceKey, "AVERAGE", weekStart),
    };
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">KPIs</h1>
        <p className="text-gray-500 mt-1">
          Weekly key performance indicators by business segment
        </p>
      </div>

      <KpiView segment={segment} week={week} data={data} />
    </div>
  );
}
