import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth-helpers";
import { Role, KpiSegment } from "@prisma/client";
import { isValidMetricKey } from "@/lib/kpis";
import { fromWeekParam } from "@/lib/week";

function isSuperAdmin(role: string) {
  return role === Role.SUPER_ADMIN || role === Role.ADMIN;
}

const scaledInt = z.number().int().nullable();

const bodySchema = z.object({
  segment: z.enum([
    "MOBILE_GROOMING",
    "BOARDING",
    "TRAINING",
    "DAYCARE",
    "IN_HOUSE_GROOMING",
  ]),
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  values: z.array(
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

  const { segment, weekStart, values } = parsed.data;

  for (const row of values) {
    if (!isValidMetricKey(segment as KpiSegment, row.metricKey)) {
      return NextResponse.json(
        { error: `Unknown metric "${row.metricKey}" for segment ${segment}` },
        { status: 400 },
      );
    }
  }

  const weekStartDate = fromWeekParam(weekStart);

  await prisma.$transaction(
    values.map((row) =>
      prisma.kpiWeeklyValue.upsert({
        where: {
          segment_weekStart_metricKey: {
            segment: segment as KpiSegment,
            weekStart: weekStartDate,
            metricKey: row.metricKey,
          },
        },
        update: { value: row.value, average: row.average, target: row.target },
        create: {
          segment: segment as KpiSegment,
          weekStart: weekStartDate,
          metricKey: row.metricKey,
          value: row.value,
          average: row.average,
          target: row.target,
        },
      }),
    ),
  );

  return NextResponse.json({ ok: true });
}
