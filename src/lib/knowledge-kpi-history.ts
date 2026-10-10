import { prisma } from "@/lib/prisma";
import { getActiveBusiness } from "@/lib/business-server";
import type { KnowledgeSource } from "@/lib/knowledge";
import { requestedSegments } from "@/lib/knowledge-kpis";
import { completedReportWeeks, reportPeriod } from "@/lib/knowledge-report-period";
import { fullReportWeeks } from "@/lib/knowledge-report-kpis";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";
import { resolveStandingAmount } from "@/lib/kpi-standing";
import { formatKpiValue } from "@/lib/utils";
import { getResortStaffHoursByWeek } from "@/lib/payroll-kpis";
import { DAYCARE_VISIT_METRIC_KEYS, DAYCARE_CALCULATED_VALUE_KEYS, calculateBoardingDerivedMetricValues, calculateDaycareDerivedMetricValues } from "@/lib/kpis";

export function historyWindow(question: string, now = new Date()) {
  const supplied = reportPeriod(question, now);
  const today = formatEasternDate(now);
  const monthly = /\b(?:previous|prior|past|recent) months\b/i.test(question);
  const lastMonthEnd = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
  lastMonthEnd.setUTCDate(0);
  const firstMonth = new Date(Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth() - 2, 1));
  const recent = completedReportWeeks(4, now);
  const period = supplied ?? (monthly ? { start: firstMonth.toISOString().slice(0, 10), end: lastMonthEnd.toISOString().slice(0, 10) }
    : { start: recent[3].start, end: recent[0].end });
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const end = [period.end, yesterday.toISOString().slice(0, 10)].sort()[0];
  const eligible = fullReportWeeks(period.start, end);
  return { ...period, weeks: eligible.slice(-26), capped: eligible.length > 26,
    assumption: supplied ? "Requested period; only complete Sunday–Saturday weeks entirely inside it are shown."
      : monthly ? "No exact months supplied: showing complete reporting weeks inside the three most recent completed calendar months. Boundary weeks are excluded; these are not full calendar-month totals."
        : "No reporting dates supplied: using the four most recent completed Sunday–Saturday weeks." };
}

export async function findKpiHistory(question: string): Promise<KnowledgeSource[]> {
  const active = await getActiveBusiness();
  const combined = /both businesses|all businesses|combined|company.wide/i.test(question);
  const explicitBusiness = /mobile[ -]?grooming/i.test(question) ? "Mobile Grooming"
    : /pet[ -]?resort/i.test(question) ? "Pet Resort" : active.label;
  let scope = combined ? question : `${question} ${explicitBusiness}`;
  if (/\bgrooming\b/i.test(question) && !/mobile[ -]?grooming|in[ -]?house/i.test(question)) {
    scope += explicitBusiness === "Mobile Grooming" ? " Mobile Grooming" : " In-House Grooming";
  }
  const segments = combined ? requestedSegments("all") : requestedSegments(scope);
  const period = historyWindow(question);
  const dates = period.weeks.map((week) => new Date(`${week}T00:00:00Z`));
  const [rows, targets, hours] = await Promise.all([
    prisma.kpiWeeklyValue.findMany({ where: { segment: { in: segments.map((segment) => segment.key) }, weekStart: { in: dates } },
      select: { segment: true, weekStart: true, metricKey: true, value: true, updatedAt: true } }),
    prisma.kpiStandingValue.findMany({ where: { segment: { in: segments.map((segment) => segment.key) }, field: "TARGET",
      effectiveWeekStart: { lte: new Date(`${period.end}T00:00:00Z`) } },
      select: { segment: true, metricKey: true, field: true, amount: true, effectiveWeekStart: true } }),
    segments.some((segment) => segment.key === "DAYCARE") ? getResortStaffHoursByWeek(dates) : Promise.resolve(new Map<string, number>()),
  ]);
  return segments.map((segment) => {
    const saved = rows.filter((row) => row.segment === segment.key);
    const lines = period.weeks.map((week) => {
      const values: Record<string, number | null> = Object.fromEntries(saved.filter((row) => row.weekStart.toISOString().slice(0, 10) === week)
        .map((row) => [row.metricKey, row.value]));
      if (segment.key === "BOARDING") Object.assign(values, calculateBoardingDerivedMetricValues(values));
      if (segment.key === "DAYCARE") {
        // Partial component sums would understate visits and mislead strategy decisions.
        for (const key of DAYCARE_CALCULATED_VALUE_KEYS) values[key] = null;
        if (DAYCARE_VISIT_METRIC_KEYS.every((key) => typeof values[key] === "number") && typeof values.evaluations === "number") {
          Object.assign(values, calculateDaycareDerivedMetricValues(values));
        }
        values.staff_hours = hours.get(week) ?? null;
      }
      const facts = segment.metrics.filter((metric) => metric.section === "ACTUALS").map((metric) => {
        const target = resolveStandingAmount(targets.filter((row) => row.segment === segment.key), metric.mirrorsKey ?? metric.key, "TARGET", new Date(`${week}T00:00:00Z`));
        return `${metric.label}: ${values[metric.key] == null ? "missing" : formatKpiValue(values[metric.key]!, metric.format)}${target === null ? "" : ` (weekly target ${formatKpiValue(target, metric.format)})`}`;
      });
      return `Week starting ${week}: ${facts.join("; ")}.`;
    });
    const updated = saved.reduce((latest, row) => row.updatedAt > latest ? row.updatedAt : latest, new Date(0));
    return { id: `record:kpi-history:${segment.key}:${period.start}:${period.end}`, kind: "record", title: `${segment.label} KPI history, ${period.start}–${period.end}`,
      url: `/finance/kpis?week=${period.weeks.at(-1) ?? period.start}&segment=${segment.key === "MOBILE_GROOMING" ? "MOBILE_GROOMING" : "PET_RESORT"}`,
      excerpt: [`${period.assumption} ${segment.label}. ${period.capped ? "Limited to the last 26 eligible weeks." : ""}`,
        ...lines, ...(lines.length ? [] : ["No completed reporting weeks inside this period."]),
        "Missing values are unknown, not zero. Weekly distinct clients may repeat across weeks; do not sum them into period-unique customers. Weekly goals are not approved quarterly targets. This report does not provide actual service contribution costs, daily staffed capacity, customer-level retention cohorts, or package causal effects.",
        `Last saved actual update: ${updated.getTime() ? updated.toISOString() : "no actuals saved"}.`].join("\n"),
      updatedAt: updated.getTime() ? updated.toISOString() : new Date().toISOString(), dateKind: "entry" } satisfies KnowledgeSource;
  });
}
