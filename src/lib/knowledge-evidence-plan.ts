import type { KnowledgeSource } from "@/lib/knowledge";
import type { ReportPlan, PlannedReport } from "@/lib/knowledge-report-plan";
import { needsKnowledgeAnalysis } from "@/lib/knowledge-answer-policy";
import { completedReportWeeks, reportPeriod } from "@/lib/knowledge-report-period";

/** Minimum evidence coverage for decision questions, including when model planning fails. */
export function supplementReportPlan(question: string, plan: ReportPlan | null, now = new Date()): ReportPlan | null {
  if (!needsKnowledgeAnalysis(question)) return plan;
  const tasks: PlannedReport[] = [...(plan?.tasks ?? [])];
  const add = (report: PlannedReport["report"], metricIds: PlannedReport["metricIds"], query = question) => {
    if (!tasks.some((task) => task.report === report)) tasks.push({ report, metricIds, question: query });
  };
  const investment = /\b(?:invest\w*|budget)\b/i.test(question);
  const services = /\b(?:boarding|daycare|training|grooming|service|capacity|productiv\w*|retention|growth|targets?)\b/i.test(question);
  if (services || investment) {
    // Keep temporal phrasing (e.g. "previous months") that has no single parsed date range.
    for (let i = tasks.length - 1; i >= 0; i--) if (tasks[i].report === "kpi-history") tasks.splice(i, 1);
    add("kpi-history", ["kpi.history"]);
  }
  const growthWithoutDates = /\b(?:revenue|sales) growth\b/i.test(question) && !reportPeriod(question, now);
  if (!investment && !growthWithoutDates && /\b(?:revenue|sales|profit\w*|margin|pric\w*)\b/i.test(question)) {
    add("profit-loss", ["finance.net_sales", "finance.estimated_profit"], `${question} net sales and net profit`);
  }
  if (/\b(?:website|funnel|conversion|inquiries)\b/i.test(question)) add("funnel", ["website.funnel"]);
  if (/\bdaycare\b/i.test(question) && /\bpackages?\b/i.test(question)) {
    add("daycare", ["daycare.expiring_packages"], "expiring daycare packages");
  }
  if (/\bretention\b/i.test(question) && /\b(?:daycare|pet[ -]?resort)\b/i.test(question)) {
    add("daycare", ["daycare.inactive_customers"], `${question} not active daycare customers`);
  }
  if (investment) {
    const business = /mobile[ -]?grooming/i.test(question) ? "Mobile Grooming" : /pet[ -]?resort/i.test(question) ? "Pet Resort" : "";
    // The investment horizon is not a request for future actuals.
    add("ads", ["ads.spend", "ads.cost_per_lead"], `${business} Meta and Google Ads cost per lead for the latest saved month`);
    add("profit-loss", ["finance.net_sales", "finance.estimated_profit"], `${business} net sales and net profit last completed week`);
  }
  // If growth has no supplied period, use matched completed periods, not a single current snapshot.
  if (growthWithoutDates) {
    const weeks = completedReportWeeks(8, now);
    const scope = /mobile[ -]?grooming/i.test(question) ? "Mobile Grooming"
      : /pet[ -]?resort/i.test(question) ? "Pet Resort" : /both businesses|combined|company.wide/i.test(question) ? "both businesses" : "";
    const periods = [{ start: weeks[3].start, end: weeks[0].end }, { start: weeks[7].start, end: weeks[4].end }];
    for (const period of periods) {
      const query = `${scope} net sales and order count from ${period.start} to ${period.end}`;
      if (!tasks.some((task) => task.question === query)) tasks.push({ report: "profit-loss",
        metricIds: ["finance.net_sales", "finance.order_count"], question: query });
    }
  }
  return tasks.length ? { tasks, needsAnalysis: true } : plan;
}

/** Keep representation from every requested report before filling remaining slots. */
export function collectReportEvidence(plan: ReportPlan, results: PromiseSettledResult<KnowledgeSource[]>[], limit = 10): KnowledgeSource[] {
  const gaps: string[] = [];
  const groups = results.map((result, index) => {
    if (result.status === "rejected") {
      gaps.push(`${plan.tasks[index].report}: lookup failed; availability is unknown. Do not treat this as no data.`);
      return [];
    }
    if (!result.value.length) gaps.push(`${plan.tasks[index].report}: this report lookup supplied no evidence for the requested question.`);
    return result.value;
  });
  const sources: KnowledgeSource[] = [];
  const seen = new Set<string>();
  const allCount = new Set(groups.flat().map((source) => source.id)).size;
  const needsCoverage = gaps.length > 0 || allCount > limit;
  const budget = limit - (needsCoverage ? 1 : 0);
  for (let row = 0; groups.some((group) => row < group.length) && sources.length < budget; row++) {
    for (const group of groups) {
      const source = group[row];
      if (source && !seen.has(source.id) && sources.length < budget) {
        seen.add(source.id);
        sources.push({ ...source, answer: undefined, excerpt: source.excerpt.replace(/\s*\[\d+\]/g, "") });
      }
    }
  }
  if (allCount > budget) gaps.push(`${allCount - sources.length} additional source passages omitted by the evidence limit; do not claim exhaustive coverage.`);
  if (gaps.length) sources.push({ id: "record:retrieval-coverage", title: "Evidence availability",
    kind: "record", url: "/knowledge", excerpt: gaps.join("\n"), updatedAt: new Date().toISOString(), dateKind: "entry" });
  return sources.map((source) => ({ ...source, reportPlan: plan, retrievalPath: "semantic-report" }));
}
