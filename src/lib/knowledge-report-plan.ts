import { z } from "zod";
import { KNOWLEDGE_METRICS, knowledgeMetric, type KnowledgeMetricId, type KnowledgeReportId } from "@/lib/knowledge-metric-catalog";
import { reportPeriod } from "@/lib/knowledge-report-period";
import { formatEasternDate } from "@/lib/marketing/submission-date-range";

export type PlannedReport = { metricIds: KnowledgeMetricId[]; report: KnowledgeReportId; question: string };
export type ReportPlan = { tasks: PlannedReport[]; needsAnalysis: boolean };

const metricIds = KNOWLEDGE_METRICS.map((metric) => metric.id);
const taskSchema = z.object({
  metricIds: z.array(z.enum(metricIds)).min(1).max(4),
  question: z.string().trim().min(8).max(500),
}).strict();
const planSchema = z.object({
  tasks: z.array(taskSchema).max(4),
  needsAnalysis: z.boolean(),
}).strict();

const responseFormat = {
  type: "json_schema", name: "ask_pooch_report_plan", strict: true,
  schema: {
    type: "object", additionalProperties: false, required: ["tasks", "needsAnalysis"],
    properties: {
      tasks: { type: "array", items: {
        type: "object", additionalProperties: false, required: ["metricIds", "question"],
        properties: {
          metricIds: { type: "array", items: { type: "string", enum: metricIds } },
          question: { type: "string" },
        },
      } },
      needsAnalysis: { type: "boolean" },
    },
  },
} as const;

function namedBusinesses(question: string): string[] {
  const names: string[] = [];
  if (/\bpet[ -]?resort\b/i.test(question)) names.push("resort");
  if (/\bmobile[ -]?grooming\b/i.test(question)) names.push("grooming");
  if (/\b(?:both businesses|all businesses|combined|company[ -]?wide)\b/i.test(question)) names.push("combined");
  return names;
}

const protectedQualifiers: Array<{ test: RegExp; reports: KnowledgeReportId[] }> = [
  { test: /\bboarding\b/i, reports: ["kpis"] },
  { test: /\bday[ -]?care\b/i, reports: ["kpis", "daycare"] },
  { test: /\btraining\b/i, reports: ["kpis"] },
  { test: /\bgoogle(?: ads?)?\b/i, reports: ["ads"] },
  { test: /\b(?:meta|facebook)\b/i, reports: ["ads"] },
  { test: /\bexpired\b/i, reports: ["daycare"] },
  { test: /\bexpiring\b/i, reports: ["daycare"] },
  { test: /\b(?:inactive|not active)\b/i, reports: ["daycare"] },
];

function mentionedPeriods(question: string, now: Date): Array<{ start: string; end: string }> {
  const relative = [...question.matchAll(/\b(?:last|this|previous|prior)(?:\s+completed)?\s+(?:week|month|year)\b/gi)]
    .map(([phrase]) => reportPeriod(phrase, now))
    .filter((period): period is NonNullable<typeof period> => period !== null);
  const whole = reportPeriod(question, now);
  return relative.length ? relative : whole ? [whole] : [];
}

export function shouldPlanReportQuestion(question: string): boolean {
  return /\b(?:how many|how much|count|total|sales|revenue|profit|expenses?|payroll|wages?|hours?|occupancy|kpis?|forms?|submissions?|leads?|inquiries|prospects?|advertis\w*|campaigns?|packages?|inactive|daycare|boarding|grooming|training|visits?|reports?|performance|spend|margin|targets?|compar\w*|trends?|last week|this week|last month|this month|ytd)\b/i.test(question);
}

/** Reject planner rewrites that change dates, businesses, or the selected report family. */
export function validateReportPlan(raw: unknown, original: string, now = new Date()): ReportPlan | null {
  const parsed = planSchema.safeParse(raw);
  if (!parsed.success) return null;
  const allowedPeriods = mentionedPeriods(original, now);
  const originalBusinesses = namedBusinesses(original);
  const tasks: PlannedReport[] = [];
  for (const task of parsed.data.tasks) {
    const metrics = task.metricIds.map(knowledgeMetric);
    if (metrics.some((metric) => metric === null)) return null;
    const report = metrics[0]!.report;
    if (metrics.some((metric) => metric!.report !== report)) return null;
    const plannedPeriod = reportPeriod(task.question, now);
    const comparative = /\b(?:compare|compared|versus|vs\.?|previous|prior|change|trend)\b/i.test(original);
    if (!comparative && (allowedPeriods.length
      ? !plannedPeriod || !allowedPeriods.some((period) => period.start === plannedPeriod.start && period.end === plannedPeriod.end)
      : plannedPeriod !== null)) return null;
    const taskBusinesses = namedBusinesses(task.question);
    if (originalBusinesses.length <= 1) {
      if (taskBusinesses.join(",") !== originalBusinesses.join(",")) return null;
    } else if (!taskBusinesses.length || taskBusinesses.some((business) => !originalBusinesses.includes(business))) return null;
    if (report === "forms" && /\b(?:boarding|day[ -]?care|training|grooming)\b/i.test(
      original.replace(/\bmobile[ -]?grooming\b/gi, ""))) return null;
    if (protectedQualifiers.some(({ test, reports }) => reports.includes(report) && test.test(original) && !test.test(task.question))) return null;
    if (metrics.some((metric) => !task.question.toLowerCase().includes(metric!.term.toLowerCase()))) return null;
    tasks.push({ metricIds: task.metricIds, report, question: task.question });
  }
  return { tasks: tasks.filter((task, index) => tasks.findIndex((other) =>
    other.report === task.report && other.question.toLowerCase() === task.question.toLowerCase()) === index),
    needsAnalysis: tasks.length > 0 && (parsed.data.needsAnalysis || tasks.length > 1) };
}

type PlannerResponse = { output?: Array<{ type?: string; role?: string; content?: Array<{ type?: string; text?: string }> }> };

export async function planReportQuestion(question: string, options: {
  now?: Date; key?: string; fetcher?: typeof fetch;
} = {}): Promise<ReportPlan | null> {
  if (process.env.ASK_POOCH_SEMANTIC_ROUTING === "false") return null;
  if (!shouldPlanReportQuestion(question)) return { tasks: [], needsAnalysis: false };
  const key = options.key ?? process.env.openai ?? process.env.OPENAI_API_KEY;
  if (!key) return null;
  const now = options.now ?? new Date();
  try {
    const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/responses", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-6-luna", store: false, reasoning: { effort: "none" }, max_output_tokens: 1200,
        text: { format: responseFormat },
        instructions: [
          "Plan read-only Planet Pooch report lookups. Return no answer and no database query.",
          "Choose only catalog metrics supported by an application report. Return empty tasks for how-to, policy, or person lookups.",
          "Rewrite each requested report lookup as a short standalone question using every selected metric's exact canonical term.",
          "Preserve the user's dates, business names, qualifiers, and comparison wording. Never invent a date, business, service, or filter.",
          "Use separate tasks for different report families or different periods. Include every part of a compound report question, at most four tasks.",
          "Lead forms without a named ad platform means submitted website new-client forms. Named Meta, Facebook, or Google Ads leads are advertising leads. Bare leads without context are ambiguous: return no tasks.",
          "Do not plan website form counts filtered by a service such as daycare or boarding; that report count is only by business and date.",
          "Set needsAnalysis true for comparisons, explanations, recommendations, scenarios, or questions with multiple requested facts.",
        ].join(" "),
        input: `Current Eastern date: ${formatEasternDate(now)}.\nQuestion: ${question}\nAvailable metrics:\n${KNOWLEDGE_METRICS.map((metric) =>
          `${metric.id} | canonical term: ${metric.term} | ${metric.meaning}`).join("\n")}`,
      }),
      cache: "no-store", signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Planner returned ${response.status}`);
    const body = await response.json() as PlannerResponse;
    const output = (body.output ?? []).filter((item) => item.type === "message" && item.role === "assistant")
      .flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text")
      .map((item) => item.text ?? "").join("").trim();
    if (!output) return null;
    const plan = validateReportPlan(JSON.parse(output), question, now);
    if (!plan) console.warn("[knowledge.plan] Structured plan did not pass report validation");
    return plan;
  } catch (error) {
    console.error("[knowledge.plan] Report planning failed", error instanceof Error ? error.name : "unknown");
    return null;
  }
}
