import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { KPI_SEGMENTS } from "@/lib/kpis";
import { currentWeekStart, fromWeekParam, isValidWeekParam, toWeekParam } from "@/lib/week";
import { resolveStandingAmount, type StandingRow } from "@/lib/kpi-standing";
import { AllKpisView, type AllKpisData } from "./AllKpisView";

export default async function AllKpisPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireSuperAdmin();
  const params = await searchParams;

  let weekStart: Date;
  if (isValidWeekParam(params.week)) {
    weekStart = fromWeekParam(params.week);
  } else {
    const latest = await prisma.kpiWeeklyValue.findFirst({
      orderBy: { weekStart: "desc" },
      select: { weekStart: true },
    });
    weekStart = latest?.weekStart ?? currentWeekStart();
  }

  const week = toWeekParam(weekStart);

  const [valueRows, standingRows] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { weekStart },
      select: { segment: true, metricKey: true, value: true },
    }),
    prisma.kpiStandingValue.findMany({
      where: { effectiveWeekStart: { lte: weekStart } },
      select: { segment: true, metricKey: true, field: true, amount: true, effectiveWeekStart: true },
    }),
  ]);

  const segments: AllKpisData = {};
  for (const segDef of KPI_SEGMENTS) {
    const segValues = valueRows.filter((r) => r.segment === segDef.key);
    const segStanding = standingRows.filter((r) => r.segment === segDef.key) as StandingRow[];
    const valueByKey = new Map(segValues.map((r) => [r.metricKey, r.value]));

    const data: Record<string, { value: number | null; target: number | null; average: number | null }> = {};
    for (const metric of segDef.metrics) {
      const sourceKey = metric.mirrorsKey ?? metric.key;
      data[metric.key] = {
        value: valueByKey.get(metric.key) ?? null,
        target: resolveStandingAmount(segStanding, sourceKey, "TARGET", weekStart),
        average: resolveStandingAmount(segStanding, sourceKey, "AVERAGE", weekStart),
      };
    }

    segments[segDef.key] = data;
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">All KPIs</h1>
        <p className="text-gray-500 mt-1">
          Combined weekly KPIs across all business segments
        </p>
      </div>

      <AllKpisView week={week} segments={segments} />
    </div>
  );
}
