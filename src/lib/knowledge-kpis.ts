import { prisma } from "@/lib/prisma";
import type { KnowledgeSource } from "@/lib/knowledge";
import {
  BOARDING_NIGHTS_METRIC_KEY,
  BOARDING_OCCUPANCY_CAPACITY_NIGHTS,
  BOARDING_OCCUPANCY_RATE_METRIC_KEY,
  DAYCARE_STAFF_HOURS_METRIC_KEY,
  KPI_SEGMENTS,
  calculateBoardingDerivedMetricValues,
  calculateDaycareDerivedMetricValues,
} from "@/lib/kpis";
import { resolveStandingAmount } from "@/lib/kpi-standing";
import { getResortStaffHoursByWeek } from "@/lib/payroll-kpis";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";
import { formatKpiValue } from "@/lib/utils";
import { weekStartOf, toWeekParam } from "@/lib/week";

type DateRange = { start: string; end: string } | null;

export function isKpiQuestion(question: string): boolean {
  if (/\b(kpis?|key performance indicators?|occupancy|rebook rate|staff hours)\b/i.test(question)) return true;
  return /\b(boarding|day[ -]?care|training|grooming|pet[ -]?resort)\b/i.test(question)
    && /\b(revenue|sales|nights|packages?|addons?|visits?|appointments?|evaluations?|clients|dogs)\b/i.test(question);
}

export function kpiRequestedWeek(question: string, range: DateRange, now = new Date()): Date | null {
  const ending = question.match(/\b(?:week[\s-]*(?:ending|ended|end)|w\/e)\s*(?:on\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/i);
  if (ending) {
    const today = formatEasternDate(now);
    const suppliedYear = ending[3] ? Number(ending[3]) : null;
    let year = suppliedYear === null ? Number(today.slice(0, 4)) : suppliedYear < 100 ? 2000 + suppliedYear : suppliedYear;
    const iso = (value: number) => `${value}-${ending[1].padStart(2, "0")}-${ending[2].padStart(2, "0")}`;
    if (suppliedYear === null && iso(year) > today) year -= 1;
    const date = new Date(`${iso(year)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso(year)) return null;
    return weekStartOf(date);
  }
  if (!range) return null;
  const days = (Date.parse(`${range.end}T00:00:00.000Z`) - Date.parse(`${range.start}T00:00:00.000Z`)) / 86_400_000;
  if (days < 0 || days > 6) return null;
  return weekStartOf(new Date(`${range.start}T00:00:00.000Z`));
}

function requestedSegments(question: string) {
  const lower = question.toLowerCase();
  const keys = new Set<string>();
  if (/\bmobile[ -]?grooming\b/.test(lower)) keys.add("MOBILE_GROOMING");
  if (/\bin[ -]?house[ -]?grooming\b/.test(lower)) keys.add("IN_HOUSE_GROOMING");
  if (/\bboarding\b/.test(lower)) keys.add("BOARDING");
  if (/\bday[ -]?care\b/.test(lower)) keys.add("DAYCARE");
  if (/\btraining\b/.test(lower)) keys.add("TRAINING");
  if (!keys.size && /\bpet[ -]?resort\b/.test(lower)) {
    for (const segment of KPI_SEGMENTS) if (segment.key !== "MOBILE_GROOMING") keys.add(segment.key);
  }
  return keys.size ? KPI_SEGMENTS.filter((segment) => keys.has(segment.key)) : KPI_SEGMENTS;
}

export async function findKpiSources(question: string, range: DateRange): Promise<KnowledgeSource[]> {
  if (!isKpiQuestion(question) || /\bhow many\b.*\b(?:kpi values|kpi records)\b/i.test(question)) return [];
  let weekStart = kpiRequestedWeek(question, range);
  if (!weekStart && (range || /\bweek[\s-]*(?:ending|ended|end)\b|\bw\/e\b|\d{1,2}\/\d{1,2}/i.test(question))) return [];
  const segments = requestedSegments(question);
  if (!weekStart) {
    const latest = await prisma.kpiWeeklyValue.findFirst({
      where: { segment: { in: segments.map((segment) => segment.key) } },
      orderBy: { weekStart: "desc" }, select: { weekStart: true },
    });
    if (!latest) return [];
    weekStart = latest.weekStart;
  }

  const [values, standing, staffHours] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { segment: { in: segments.map((segment) => segment.key) }, weekStart },
      select: { segment: true, metricKey: true, value: true, updatedAt: true },
    }),
    prisma.kpiStandingValue.findMany({
      where: { segment: { in: segments.map((segment) => segment.key) }, effectiveWeekStart: { lte: weekStart } },
      select: { segment: true, metricKey: true, field: true, amount: true, effectiveWeekStart: true },
    }),
    segments.some((segment) => segment.key === "DAYCARE")
      ? getResortStaffHoursByWeek([weekStart]) : Promise.resolve(new Map<string, number>()),
  ]);
  const week = toWeekParam(weekStart);
  const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000).toISOString().slice(0, 10);
  const checked = new Date();
  return segments.map((segment) => {
    const saved = values.filter((row) => row.segment === segment.key);
    const valueByKey = new Map(saved.map((row) => [row.metricKey, row.value]));
    const rawValues = Object.fromEntries(valueByKey);
    const derived = segment.key === "BOARDING" ? calculateBoardingDerivedMetricValues(rawValues)
      : segment.key === "DAYCARE" ? calculateDaycareDerivedMetricValues(rawValues) : {};
    const segmentStanding = standing.filter((row) => row.segment === segment.key);
    const lines = [
      `Finance KPI segment: ${segment.label}; week ${week} through ${weekEnd} (Sunday through Saturday).`,
      `Saved KPI database checked: ${checked.toISOString()}.`,
      ...(saved.length ? segment.metrics.map((metric) => {
        const actual = metric.key === DAYCARE_STAFF_HOURS_METRIC_KEY && segment.key === "DAYCARE"
          ? staffHours.get(week) ?? null
          : (derived as Record<string, number>)[metric.key] ?? valueByKey.get(metric.key) ?? null;
        const metricStanding = metric.mirrorsKey ?? metric.key;
        const target = resolveStandingAmount(segmentStanding, metricStanding, "TARGET", weekStart);
        const average = resolveStandingAmount(segmentStanding, metricStanding, "AVERAGE", weekStart);
        const details = [`${metric.label} (${metric.key}) actual: ${actual === null ? "not recorded" : formatKpiValue(actual, metric.format)}`];
        if (target !== null) details.push(`target: ${formatKpiValue(target, metric.format)}`);
        if (average !== null) details.push(`average: ${formatKpiValue(average, metric.format)}`);
        if (segment.key === "BOARDING" && metric.key === BOARDING_OCCUPANCY_RATE_METRIC_KEY && actual !== null) {
          details.push(`calculated from ${formatKpiValue(valueByKey.get(BOARDING_NIGHTS_METRIC_KEY), "number")} saved nights / ${BOARDING_OCCUPANCY_CAPACITY_NIGHTS} capacity nights`);
        }
        return `${details.join("; ")}.`;
      }) : [`No actual KPI values are saved for ${segment.label} in this week. Missing data is not zero.`]),
    ];
    const updatedAt = saved.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, saved[0]?.updatedAt ?? checked);
    return {
      id: `record:kpi:${segment.key}:${week}`,
      kind: "record" as const,
      title: `${segment.label} KPIs, week ending ${weekEnd}`,
      url: `/finance/kpis?week=${week}&segment=${segment.key === "MOBILE_GROOMING" ? "MOBILE_GROOMING" : "PET_RESORT"}`,
      excerpt: lines.join("\n").slice(0, 1500),
      updatedAt: updatedAt.toISOString(),
      dateKind: "entry" as const,
    };
  });
}
