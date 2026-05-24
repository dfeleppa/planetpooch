import { requireSuperAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { KpiSegment } from "@prisma/client";
import { DEFAULT_SEGMENT, isValidSegment } from "@/lib/kpis";
import { currentWeekStart, fromWeekParam, isValidWeekParam, toWeekParam } from "@/lib/week";
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

  const rows = await prisma.kpiWeeklyValue.findMany({
    where: { segment, weekStart },
    select: { metricKey: true, value: true, average: true, target: true },
  });

  const data: Record<string, KpiCell> = {};
  for (const row of rows) {
    data[row.metricKey] = { value: row.value, average: row.average, target: row.target };
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
