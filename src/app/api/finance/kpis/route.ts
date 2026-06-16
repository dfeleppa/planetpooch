import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { Role, KpiSegment, KpiStandingField, Prisma } from "@prisma/client";
import {
  calculateDaycareDerivedMetricValues,
  getMetricDef,
  isBackendKpiMetric,
  isValidMetricKey,
} from "@/lib/kpis";
import { fromWeekParam } from "@/lib/week";
import { resolveStandingAmount, type StandingRow } from "@/lib/kpi-standing";

function isSuperAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

const scaledInt = z.number().int().nullable();

const bodySchema = z.object({
  segment: z.enum(["MOBILE_GROOMING", "BOARDING", "TRAINING", "DAYCARE", "IN_HOUSE_GROOMING"]),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  metrics: z.array(
    z.object({
      metricKey: z.string().min(1),
      value: scaledInt,
      average: scaledInt,
      target: scaledInt,
    }),
  ),
});

type SubmittedMetric = z.infer<typeof bodySchema>["metrics"][number];

function withDerivedSubmittedMetrics(
  segment: KpiSegment,
  metrics: SubmittedMetric[]
): SubmittedMetric[] {
  if (segment !== KpiSegment.DAYCARE) return metrics;

  const values = Object.fromEntries(
    metrics.map((metric) => [metric.metricKey, metric.value])
  );
  const derived = calculateDaycareDerivedMetricValues(values);
  if (Object.keys(derived).length === 0) return metrics;

  return metrics.map((metric) => {
    const value = derived[metric.metricKey as keyof typeof derived];
    return value === undefined ? metric : { ...metric, value };
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user || !isSuperAdmin((session.user as { role: string }).role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const segment = parsed.data.segment as KpiSegment;
  const { weekStart } = parsed.data;
  const metrics = withDerivedSubmittedMetrics(segment, parsed.data.metrics);

  for (const m of metrics) {
    if (!isValidMetricKey(segment, m.metricKey)) {
      return NextResponse.json(
        { error: `Unknown metric "${m.metricKey}" for segment ${segment}` },
        { status: 400 },
      );
    }
  }

  const week = fromWeekParam(weekStart);

  const [existingValues, standing] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({ where: { segment, weekStart: week }, select: { metricKey: true } }),
    prisma.kpiStandingValue.findMany({
      where: { segment },
      select: { metricKey: true, field: true, amount: true, effectiveWeekStart: true },
    }),
  ]);
  const hasValueRow = new Set(existingValues.map((r) => r.metricKey));
  const standingRows = standing as StandingRow[];

  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const m of metrics) {
    const valueIsBackend = isBackendKpiMetric(segment, m.metricKey);

    // Per-week actual/forecast value. Skip creating all-null rows.
    if (!valueIsBackend && (m.value !== null || hasValueRow.has(m.metricKey))) {
      ops.push(
        prisma.kpiWeeklyValue.upsert({
          where: { segment_weekStart_metricKey: { segment, weekStart: week, metricKey: m.metricKey } },
          update: { value: m.value },
          create: { segment, weekStart: week, metricKey: m.metricKey, value: m.value },
        }),
      );
    }

    // Target & average are standing values, applied strictly from the edited
    // week forward (never backfilled — past weeks are untouched), and only
    // written when the submitted value differs from what's already in effect.
    // Mirrored (forecast) metrics derive their target/average from their
    // source, so we never store standing values on them.
    if (getMetricDef(segment, m.metricKey)?.mirrorsKey) continue;
    const fields: Array<[KpiStandingField, number | null]> = [
      [KpiStandingField.TARGET, m.target],
      [KpiStandingField.AVERAGE, m.average],
    ];
    for (const [field, submitted] of fields) {
      const resolved = resolveStandingAmount(standingRows, m.metricKey, field, week);
      if (submitted === resolved) continue;
      ops.push(
        prisma.kpiStandingValue.upsert({
          where: {
            segment_metricKey_field_effectiveWeekStart: {
              segment,
              metricKey: m.metricKey,
              field,
              effectiveWeekStart: week,
            },
          },
          update: { amount: submitted },
          create: { segment, metricKey: m.metricKey, field, effectiveWeekStart: week, amount: submitted },
        }),
      );
    }
  }

  if (ops.length > 0) {
    await prisma.$transaction(ops);
  }

  return NextResponse.json({ ok: true });
}
