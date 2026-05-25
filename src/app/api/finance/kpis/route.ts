import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { Role, KpiSegment, KpiStandingField, Prisma } from "@prisma/client";
import { isValidMetricKey } from "@/lib/kpis";
import { addWeeks, currentWeekStart, fromWeekParam } from "@/lib/week";
import { hasStanding, resolveStandingAmount, type StandingRow } from "@/lib/kpi-standing";

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
  const { weekStart, metrics } = parsed.data;

  for (const m of metrics) {
    if (!isValidMetricKey(segment, m.metricKey)) {
      return NextResponse.json(
        { error: `Unknown metric "${m.metricKey}" for segment ${segment}` },
        { status: 400 },
      );
    }
  }

  const week = fromWeekParam(weekStart);
  // First-ever set of a target/average backfills the previous 4 weeks; an edit
  // on an even older week takes effect from that week instead.
  const backfillFloor = addWeeks(currentWeekStart(), -4);
  const firstSetEffective = week.getTime() < backfillFloor.getTime() ? week : backfillFloor;

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
    // Per-week actual/forecast value. Skip creating all-null rows.
    if (m.value !== null || hasValueRow.has(m.metricKey)) {
      ops.push(
        prisma.kpiWeeklyValue.upsert({
          where: { segment_weekStart_metricKey: { segment, weekStart: week, metricKey: m.metricKey } },
          update: { value: m.value },
          create: { segment, weekStart: week, metricKey: m.metricKey, value: m.value },
        }),
      );
    }

    // Target & average are standing values: only write when the submitted value
    // differs from what's already in effect at this week, and apply it from the
    // edited week forward (or backfilled on the very first set).
    const fields: Array<[KpiStandingField, number | null]> = [
      [KpiStandingField.TARGET, m.target],
      [KpiStandingField.AVERAGE, m.average],
    ];
    for (const [field, submitted] of fields) {
      const resolved = resolveStandingAmount(standingRows, m.metricKey, field, week);
      if (submitted === resolved) continue;
      const effective = hasStanding(standingRows, m.metricKey, field) ? week : firstSetEffective;
      ops.push(
        prisma.kpiStandingValue.upsert({
          where: {
            segment_metricKey_field_effectiveWeekStart: {
              segment,
              metricKey: m.metricKey,
              field,
              effectiveWeekStart: effective,
            },
          },
          update: { amount: submitted },
          create: { segment, metricKey: m.metricKey, field, effectiveWeekStart: effective, amount: submitted },
        }),
      );
    }
  }

  await prisma.$transaction(ops);

  return NextResponse.json({ ok: true });
}
