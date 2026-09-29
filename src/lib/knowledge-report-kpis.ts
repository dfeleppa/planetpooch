import { prisma } from "@/lib/prisma";
import type { KnowledgeSource } from "@/lib/knowledge";
import { findKpiSources, requestedSegments } from "@/lib/knowledge-kpis";
import { reportPeriod } from "@/lib/knowledge-report-period";
import { KPI_SEGMENTS, BOARDING_OCCUPANCY_CAPACITY_NIGHTS,
  calculateBoardingDerivedMetricValues, calculateDaycareDerivedMetricValues,
  DAYCARE_STAFF_HOURS_METRIC_KEY } from "@/lib/kpis";
import { getResortStaffHoursByWeek } from "@/lib/payroll-kpis";
import { formatKpiValue } from "@/lib/utils";
import { toWeekParam } from "@/lib/week";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";

type Metric = (typeof KPI_SEGMENTS)[number]["metrics"][number];
const dayMs = 86_400_000;

export function requestedKpiMetrics(question: string, metrics: Metric[]): Metric[] {
  const lower = question.toLowerCase().replace(/[-_]/g, " ");
  const exact = metrics.filter((metric) => lower.includes(metric.label.toLowerCase().replace(/[-_]/g, " ")));
  if (exact.length) return exact;
  return metrics.filter((metric) => {
    const label = metric.label.toLowerCase().replace(/[-_]/g, " ");
    if (lower.includes(label)) return true;
    if (metric.key === "occupancy_rate") return /\boccupancy(?: rate)?\b/.test(lower);
    if (metric.key === "revenue" || metric.key === "total_revenue") return /\b(?:revenue|sales)\b/.test(lower);
    if (metric.key === "nights") return /\bnights?\b/.test(lower);
    if (metric.key === "staff_hours") return /\bstaff hours?\b/.test(lower);
    return false;
  });
}

export function fullReportWeeks(start: string, end: string): string[] {
  const first = new Date(`${start}T00:00:00.000Z`);
  first.setUTCDate(first.getUTCDate() + (7 - first.getUTCDay()) % 7);
  const last = new Date(`${end}T00:00:00.000Z`);
  last.setUTCDate(last.getUTCDate() - 6);
  const weeks: string[] = [];
  for (let week = first; week <= last; week = new Date(week.getTime() + 7 * dayMs)) {
    weeks.push(toWeekParam(week));
  }
  return weeks;
}

export function aggregateMetric(metric: Metric, values: number[], nights: number[]): { value: number; method: string } {
  if (metric.key === "occupancy_rate") {
    const totalNights = nights.reduce((sum, value) => sum + value, 0);
    return { value: Math.round(totalNights / (BOARDING_OCCUPANCY_CAPACITY_NIGHTS * nights.length) * 100),
      method: `weighted from ${totalNights / 100} nights across ${nights.length} saved weeks` };
  }
  if (metric.format === "percent" || /^avg_/.test(metric.key)) {
    return { value: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      method: `average of ${values.length} saved weekly values` };
  }
  return { value: values.reduce((sum, value) => sum + value, 0),
    method: `sum of ${values.length} saved weekly values${metric.key === "unique_clients" ? "; clients may repeat across weeks" : ""}` };
}

export async function findKpiReport(question: string): Promise<KnowledgeSource[]> {
  const period = reportPeriod(question);
  if (period && period.start > formatEasternDate(new Date())) return [{
    id: `record:report:kpi:future:${period.start}`, kind: "record", title: `KPIs for ${period.label}`,
    url: "/finance/kpis", excerpt: `${period.label} has not started; no actual KPI values are available.`,
    updatedAt: new Date().toISOString(), dateKind: "entry",
    answer: `${period.label} has not started, so the KPI report has no actual results yet. [1]`,
  }];
  if (!period || period.kind === "day" || period.kind === "week") {
    return findKpiSources(question, period ? { start: period.start, end: period.end } : null);
  }
  const weeks = fullReportWeeks(period.start, period.end);
  const segments = requestedSegments(question);
  if (!weeks.length) return [{
    id: `record:report:kpi:empty:${period.start}`, kind: "record", title: `KPIs for ${period.label}`,
    url: "/finance/kpis", excerpt: `No completed Sunday–Saturday reporting week falls entirely inside ${period.label}.`,
    updatedAt: new Date().toISOString(), dateKind: "entry",
    answer: `There is no completed reporting week fully inside ${period.label} yet. [1]`,
  }];
  const dates = weeks.map((week) => new Date(`${week}T00:00:00.000Z`));
  const [rows, staffHours] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { segment: { in: segments.map((segment) => segment.key) }, weekStart: { in: dates } },
      select: { segment: true, weekStart: true, metricKey: true, value: true, updatedAt: true },
    }),
    segments.some((segment) => segment.key === "DAYCARE")
      ? getResortStaffHoursByWeek(dates) : Promise.resolve(new Map<string, number>()),
  ]);
  return segments.map((segment) => {
    const selectedMetrics = requestedKpiMetrics(question, segment.metrics);
    const metrics = selectedMetrics.length ? selectedMetrics : segment.metrics.filter((metric) => metric.section === "ACTUALS");
    const facts = metrics.map((metric) => {
      const values: number[] = [];
      const nights: number[] = [];
      for (const week of weeks) {
        const saved = rows.filter((row) => row.segment === segment.key && toWeekParam(row.weekStart) === week);
        const byKey = Object.fromEntries(saved.map((row) => [row.metricKey, row.value]));
        const derived = segment.key === "BOARDING" ? calculateBoardingDerivedMetricValues(byKey)
          : segment.key === "DAYCARE" ? calculateDaycareDerivedMetricValues(byKey) : {};
        const value = metric.key === DAYCARE_STAFF_HOURS_METRIC_KEY && segment.key === "DAYCARE"
          ? staffHours.get(week) ?? null
          : (derived as Record<string, number>)[metric.key] ?? byKey[metric.key];
        if (typeof value === "number") {
          values.push(value);
          if (metric.key === "occupancy_rate" && typeof byKey.nights === "number") nights.push(byKey.nights);
        }
      }
      if (!values.length || (metric.key === "occupancy_rate" && !nights.length)) {
        return { metric, value: null, method: "no saved values" };
      }
      return { metric, ...aggregateMetric(metric, values, nights) };
    });
    const lines = facts.map(({ metric, value, method }) =>
      `${metric.label}: ${value === null ? "not recorded" : formatKpiValue(value, metric.format)} (${method}; ${weeks.length} eligible completed weeks).`);
    const single = facts.length === 1 ? facts[0] : null;
    const answer = single
      ? single.value === null
        ? `The ${segment.label} KPI report has no saved ${single.metric.label.toLowerCase()} values for ${period.label}. [1]`
        : `${segment.label} ${single.metric.label.toLowerCase()} for ${period.label}: ${formatKpiValue(single.value, single.metric.format)} (${single.method}; ${weeks[0]} through ${weeks.at(-1)}, ${weeks.length} eligible completed weeks). [1]`
      : undefined;
    const latest = rows.filter((row) => row.segment === segment.key)
      .reduce((at, row) => row.updatedAt > at ? row.updatedAt : at, new Date(0));
    return {
      id: `record:report:kpi:${segment.key}:${period.start}:${period.end}`,
      title: `${segment.label} KPI report, ${period.label}`,
      kind: "record" as const,
      url: `/finance/kpis?week=${weeks.at(-1)}&segment=${segment.key === "MOBILE_GROOMING" ? "MOBILE_GROOMING" : "PET_RESORT_COPY"}`,
      excerpt: [`Report: ${segment.label} KPIs for ${period.label}. Completed weeks ${weeks[0]} through ${weeks.at(-1)}.`,
        ...lines, "Missing weekly values are not treated as zero. Period totals combine only saved weekly values."].join("\n").slice(0, 1800),
      updatedAt: latest.getTime() ? latest.toISOString() : new Date().toISOString(),
      dateKind: "entry" as const,
      answer,
    };
  });
}
