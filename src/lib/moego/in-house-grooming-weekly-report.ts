import { KpiSegment, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const IN_HOUSE_GROOMING_KPI_METRICS = {
  revenue: "revenue",
  totalPetsServiced: "total_pets_serviced",
} as const;

export type WeeklyInHouseGroomingKpiValues = {
  weekStart: string;
  totalNetSalesCents: number;
  totalPetsServiced: number;
};

function numberValue(value: number): number {
  return Math.round(value * 100);
}

export async function upsertWeeklyInHouseGroomingKpis(
  values: WeeklyInHouseGroomingKpiValues
): Promise<void> {
  const weekStart = new Date(`${values.weekStart}T00:00:00.000Z`);
  const rows = [
    {
      metricKey: IN_HOUSE_GROOMING_KPI_METRICS.revenue,
      value: values.totalNetSalesCents,
    },
    {
      metricKey: IN_HOUSE_GROOMING_KPI_METRICS.totalPetsServiced,
      value: numberValue(values.totalPetsServiced),
    },
  ];

  await prisma.$transaction(
    rows.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: KpiSegment.IN_HOUSE_GROOMING,
            weekStart,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value },
        create: {
          segment: KpiSegment.IN_HOUSE_GROOMING,
          weekStart,
          metricKey: row.metricKey,
          value: row.value,
        },
      })
    ) satisfies Prisma.PrismaPromise<unknown>[]
  );
}
