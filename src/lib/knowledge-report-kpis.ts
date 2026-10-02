import { prisma } from "@/lib/prisma";
import type { KnowledgeSource } from "@/lib/knowledge";
import { findKpiSources, requestedSegments } from "@/lib/knowledge-kpis";
import { completedReportWeeks, reportPeriod } from "@/lib/knowledge-report-period";
import { KPI_SEGMENTS, BOARDING_OCCUPANCY_CAPACITY_NIGHTS,
  BOARDING_NIGHTS_METRIC_KEY, BOARDING_OCCUPANCY_RATE_METRIC_KEY,
  calculateBoardingDerivedMetricValues, calculateDaycareDerivedMetricValues,
  DAYCARE_STAFF_HOURS_METRIC_KEY, DAYCARE_VISIT_METRIC_KEYS } from "@/lib/kpis";
import { resolveStandingAmount } from "@/lib/kpi-standing";
import { getResortStaffHoursByWeek } from "@/lib/payroll-kpis";
import { formatKpiValue } from "@/lib/utils";
import { toWeekParam } from "@/lib/week";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";

type Metric = (typeof KPI_SEGMENTS)[number]["metrics"][number];
const dayMs = 86_400_000;

export function isDaycareVisitsPerStaffHourQuestion(question: string): boolean {
  return /\bday[ -]?care\b/i.test(question) && /\bvisits?\s+per\s+staff\s+hour\b/i.test(question);
}

export function isServiceRevenueTargetQuestion(question: string): boolean {
  return /\bpet[ -]?resort\b/i.test(question) && /\b(?:segment|service|line)\b/i.test(question)
    && /\brevenue target\b/i.test(question) && /\b(?:miss\w*|shortfall|below)\b/i.test(question);
}

export function daycareVisitCount(values: Record<string, number | null | undefined>): number | null {
  if (!DAYCARE_VISIT_METRIC_KEYS.every((key) => typeof values[key] === "number")) return null;
  return DAYCARE_VISIT_METRIC_KEYS.reduce((sum, key) => sum + (values[key] ?? 0), 0) / 100;
}

async function findDaycareVisitsPerStaffHour(question: string): Promise<KnowledgeSource[]> {
  const period = reportPeriod(question) ?? completedReportWeeks(1)[0];
  const weekStart = new Date(`${period.start}T00:00:00.000Z`);
  const [rows, hoursByWeek] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { segment: "DAYCARE", weekStart, metricKey: { in: [...DAYCARE_VISIT_METRIC_KEYS] } },
      select: { metricKey: true, value: true, updatedAt: true },
    }),
    getResortStaffHoursByWeek([weekStart]),
  ]);
  const visits = daycareVisitCount(Object.fromEntries(rows.map((row) => [row.metricKey, row.value])));
  const scaledHours = hoursByWeek.get(period.start);
  const hours = scaledHours === undefined ? null : scaledHours / 100;
  const explanation = `Daycare visits include full day, half day, and enrichment visits; evaluations are excluded. No visits-per-staff-hour target is configured in the KPI report.`;
  const answer = visits === null
    ? `I cannot calculate daycare visits per staff hour for ${period.start}–${period.end}: one or more visit categories are not saved. ${explanation} [1]`
    : hours === null || hours <= 0
      ? `I cannot calculate daycare visits per staff hour for ${period.start}–${period.end}: ${visits.toLocaleString("en-US")} visits are saved, but resort staff hours are ${hours === null ? "not recorded" : "zero"}. ${explanation} [1]`
      : `Daycare had ${(visits / hours).toFixed(2)} visits per staff hour for ${period.start}–${period.end}: ${visits.toLocaleString("en-US")} visits divided by ${hours.toFixed(2)} resort staff hours. ${explanation} I cannot say whether it exceeded target. [1]`;
  const latest = rows.reduce((at, row) => row.updatedAt > at ? row.updatedAt : at, new Date(0));
  return [{ id: `record:report:kpi:daycare-visits-per-hour:${period.start}`, kind: "record",
    title: `Daycare visits per staff hour, ${period.start}–${period.end}`,
    url: `/finance/kpis?week=${period.start}&segment=PET_RESORT`, excerpt: answer, answer,
    updatedAt: latest.getTime() ? latest.toISOString() : new Date().toISOString(), dateKind: "entry" }];
}

async function findServiceRevenueTarget(question: string): Promise<KnowledgeSource[]> {
  const period = reportPeriod(question) ?? completedReportWeeks(1)[0];
  const weekStart = new Date(`${period.start}T00:00:00.000Z`);
  const revenueMetrics = [
    { segment: "BOARDING", metricKey: "revenue", label: "Boarding" },
    { segment: "TRAINING", metricKey: "group_revenue", label: "Training group" },
    { segment: "TRAINING", metricKey: "one_on_one_revenue", label: "Training 1:1" },
    { segment: "IN_HOUSE_GROOMING", metricKey: "revenue", label: "In-House Grooming" },
  ] as const;
  const [actuals, targets] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { weekStart, segment: { in: ["BOARDING", "TRAINING", "IN_HOUSE_GROOMING"] },
        metricKey: { in: ["revenue", "group_revenue", "one_on_one_revenue"] } },
      select: { segment: true, metricKey: true, value: true, updatedAt: true },
    }),
    prisma.kpiStandingValue.findMany({
      where: { segment: { in: ["BOARDING", "TRAINING", "IN_HOUSE_GROOMING"] },
        field: "TARGET", effectiveWeekStart: { lte: weekStart } },
      select: { segment: true, metricKey: true, field: true, amount: true, effectiveWeekStart: true },
    }),
  ]);
  const details = revenueMetrics.map((metric) => {
    const actual = actuals.find((row) => row.segment === metric.segment && row.metricKey === metric.metricKey)?.value;
    const target = resolveStandingAmount(targets.filter((row) => row.segment === metric.segment), metric.metricKey, "TARGET", weekStart);
    return `${metric.label}: actual ${actual === undefined ? "not recorded" : formatKpiValue(actual, "currency")}; target ${target === null ? "not set" : formatKpiValue(target, "currency")}`;
  });
  const answer = `I cannot rank which Pet Resort service segment missed its revenue target most for ${period.start}–${period.end}: the KPI report has no daycare revenue metric, and a complete set of comparable revenue targets is not saved. Available revenue figures and targets: ${details.join("; ")}. Missing targets are not zero. [1]`;
  const latest = actuals.reduce((at, row) => row.updatedAt > at ? row.updatedAt : at, new Date(0));
  return [{ id: `record:report:kpi:revenue-targets:${period.start}`, kind: "record",
    title: `Pet Resort service revenue targets, ${period.start}–${period.end}`,
    url: `/finance/kpis?week=${period.start}&segment=PET_RESORT`, excerpt: answer, answer,
    updatedAt: latest.getTime() ? latest.toISOString() : new Date().toISOString(), dateKind: "entry" }];
}

export function boardingTrendWeekCount(question: string): number | null {
  if (!/\bboarding\b/i.test(question) || !/\boccupancy\b/i.test(question)) return null;
  const match = question.match(/\b(?:last|past|previous|prior)\s+(\d{1,2}|two|three|four|five|six|eight|twelve)\s+(?:completed\s+)?weeks\b/i);
  if (!match) return null;
  const words: Record<string, number> = { two: 2, three: 3, four: 4, five: 5, six: 6, eight: 8, twelve: 12 };
  const count = words[match[1].toLowerCase()] ?? Number(match[1]);
  return count >= 2 && count <= 12 ? count : null;
}

async function findBoardingOccupancyTrend(count: number): Promise<KnowledgeSource[]> {
  const weeks = completedReportWeeks(count).reverse();
  const starts = weeks.map((week) => new Date(`${week.start}T00:00:00.000Z`));
  const [rows, standing] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({
      where: { segment: "BOARDING", weekStart: { in: starts }, metricKey: BOARDING_NIGHTS_METRIC_KEY },
      select: { weekStart: true, value: true, updatedAt: true },
    }),
    prisma.kpiStandingValue.findMany({
      where: { segment: "BOARDING", metricKey: BOARDING_OCCUPANCY_RATE_METRIC_KEY,
        field: "TARGET", effectiveWeekStart: { lte: starts.at(-1)! } },
      select: { metricKey: true, field: true, amount: true, effectiveWeekStart: true },
    }),
  ]);
  const points = weeks.map((week, index) => {
    const nights = rows.find((row) => toWeekParam(row.weekStart) === week.start)?.value;
    const actual = nights === undefined ? null
      : calculateBoardingDerivedMetricValues({ [BOARDING_NIGHTS_METRIC_KEY]: nights })[BOARDING_OCCUPANCY_RATE_METRIC_KEY] ?? null;
    const target = resolveStandingAmount(standing, BOARDING_OCCUPANCY_RATE_METRIC_KEY, "TARGET", starts[index]);
    return { week, nights, actual, target };
  });
  const missing = points.filter((point) => point.actual === null).map((point) => point.week.end);
  const first = points[0].actual;
  const last = points.at(-1)!.actual;
  const change = first === null || last === null ? null : (last - first) / 100;
  const summary = missing.length
    ? `I cannot establish the full ${count}-week trend because boarding nights are not saved for week${missing.length === 1 ? "" : "s"} ending ${missing.join(", ")}.`
    : `Boarding occupancy ${change! > 0 ? "rose" : change! < 0 ? "fell" : "was unchanged"} by ${Math.abs(change!).toFixed(1)} percentage points from the first to the latest of the last ${count} completed weeks.`;
  const details = points.map(({ week, nights, actual, target }) =>
    `${week.start}–${week.end}: ${actual === null ? "not recorded" : formatKpiValue(actual, "percent")}`
      + `${nights === undefined ? "" : ` (${formatKpiValue(nights, "number")} of ${BOARDING_OCCUPANCY_CAPACITY_NIGHTS} capacity nights)`}`
      + `; target ${target === null ? "not recorded" : formatKpiValue(target, "percent")}${actual === null || target === null ? "" : ` (${((actual - target) / 100).toFixed(1)} percentage points versus target)`}.`
  );
  const answer = `${summary}\n${details.join("\n")} These are saved weekly KPI values; missing weeks are not zero. [1]`;
  const latestUpdate = rows.reduce((at, row) => row.updatedAt > at ? row.updatedAt : at, new Date(0));
  return [{
    id: `record:report:kpi:boarding-trend:${weeks[0].start}:${weeks.at(-1)!.end}`,
    kind: "record", title: `Boarding occupancy, ${count} completed weeks through ${weeks.at(-1)!.end}`,
    url: `/finance/kpis?week=${weeks.at(-1)!.start}&segment=PET_RESORT`,
    excerpt: answer, answer,
    updatedAt: latestUpdate.getTime() ? latestUpdate.toISOString() : new Date().toISOString(), dateKind: "entry",
  }];
}

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
  if (isDaycareVisitsPerStaffHourQuestion(question)) return findDaycareVisitsPerStaffHour(question);
  if (isServiceRevenueTargetQuestion(question)) return findServiceRevenueTarget(question);
  const boardingTrendWeeks = boardingTrendWeekCount(question);
  if (boardingTrendWeeks) return findBoardingOccupancyTrend(boardingTrendWeeks);
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
